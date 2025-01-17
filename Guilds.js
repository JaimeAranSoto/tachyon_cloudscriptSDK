////////////// GUILDS

handlers.CheckExpirationForWarAttack = function (args) {

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    const myEntityId = GetEntityId(currentPlayerId);
    const MIN_ATTACKERS = config.MIN_ATTACKERS;
    const WAR_DURATION = config.WAR_DURATION;
    const INVITATION_DURATION = config.INVITATION_DURATION;
    const COST = config.COST; //[]
    const attackerGuildId = args.attackerGuildId;

    const attackerGuildObjects = GetGuildObjects(attackerGuildId);
    var expired = false;
    var failed = true;

    const attackerWarData = attackerGuildObjects.warData.DataObject;
    const warAttack = attackerWarData.attack;
    if (warAttack.leader == "") {
        log.debug("The BatlleInvitation expired previously.")
        expired = true;
        return expired;
    }
    var timeSinceCreated = Math.floor((Date.now() - Date.parse(warAttack.date)) / 1000);
    if (timeSinceCreated >= INVITATION_DURATION) {
        log.debug("The Invitation has expired.");
        if (warAttack.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader*/) {
            var warDuration = timeSinceCreated - INVITATION_DURATION;
            log.debug("War duration: " + warDuration + " of " + WAR_DURATION + " | successful? " + warAttack.successful, warAttack);
            if (warDuration >= WAR_DURATION) { //War should have ended
                log.debug("The Guild War should have ended.");
                //if (warAttack.successful) {
                FinishWar(attackerGuildId, false, myEntityId);
                return; //this will manage all data, so we don't need to continue...
                //}
                failed = true;
            } else if (!warAttack.successful || warAttack.successful == undefined) {
                const stats = attackerGuildObjects.stats.DataObject;
                if (stats.level == undefined) {
                    stats.level = 1;
                }
                const requiredRocks = Number(COST[Number(stats.level) - 1]);
                log.debug("Guild currency: " + stats.currency + " | Cost: " + requiredRocks);
                if (stats.currency >= requiredRocks) {
                    // SUBSTRACT 1 FROM WAR ENERGY
                    const previousRemainingWars = attackerWarData.energy.remainingWars;
                    attackerWarData.energy.remainingWars = previousRemainingWars - 1;

                    // entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });

                    warAttack.successful = true;
                    failed = false;
                    log.debug("The battle invitation was successful and a GuildWar started.");

                    const defenderWarData = GetGuildObjects(warAttack.defenderGuildId).warData.DataObject;

                    //Create battle defense in defender guild.
                    defenderWarData.defense = { date: new Date().toUTCString(), participants: [], attackerGuildId: attackerGuildId, deaths: [] };
                    entity.SetObjects({ Entity: { Id: warAttack.defenderGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: defenderWarData }] });

                    //Create player performances
                    attakcers: {
                        const attackerPlayerPerformances = {};

                        for (let i = 0; i < warAttack.participants.length; i++) {
                            const participant = warAttack.participants[i];
                            attackerPlayerPerformances[participant] = { kills: 0, level: 1 }; //level not considered yet.
                        }
                        attackerPlayerPerformances[warAttack.leader] = { kills: 0, level: 1 }; //level not considered yet.

                        attackerWarData.pool.playerPerformances = attackerPlayerPerformances;
                        // entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: warPool }] });
                    }
                } else {
                    log.debug("Attacker guild has no enough currency to start the battle!.");
                    failed = true;
                }
            } else {
                failed = false;
            }
        } else {
            failed = true;
        }

        if (failed) {
            log.debug("failed...");
            warAttack.successful = false;
            warAttack.participants = [];
            warAttack.leader = "";
            warAttack.defenderGuildId = "";
            warAttack.deaths = [];
            warAttack.date = new Date(1999, 1, 1).toUTCString();
        }
        attackerWarData.attack = warAttack;
        try {
            entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: attackerWarData }] });
        } catch (error) {
            log.debug("Error trying to set attackerWatData in CheckExpirationForWarAttack.");
        }
        expired = true;

    } else {
        expired = false;
        log.debug("The BatlleInvitation has not expired yet.")
    }
    return expired;
}

handlers.AcceptOrCreateWarAttack = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);
    const defenderGuildId = args.defenderGuildId; //this could be null
    const date = args.date;

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    const MIN_ATTACKERS = config.MIN_ATTACKERS;

    const myGuild = GetMyGuild(myEntityId);
    const currentWarData = GetMyGuildObjects(myEntityId).warData.DataObject;

    // CHECK IF GUILD HAS ENOUGH WAR ENERGY

    if (currentWarData.energy.remainingWars <= 0) {
        log.debug("Guild has no remaining wars available (war energy)");
        return -1;
    }

    const defenderStats = GetGuildObjects(defenderGuildId).stats.DataObject;
    var SHIELD_DURATION = defenderStats.shieldDuration;
    if (SHIELD_DURATION == null) {
        SHIELD_DURATION = 21600;
    }
    const shieldLife = (Date.now() - Date.parse(defenderGuildId.shield)) / 1000;
    if (shieldLife < SHIELD_DURATION) {
        log.debug("Defender guild has its shield active.");
        return -1;
    }


    const newAttack = {};
    newAttack.successful = false;
    newAttack.leader = myEntityId;
    newAttack.participants = [];
    newAttack.defenderGuildId = defenderGuildId;
    newAttack.deaths = [];
    newAttack.date = date;

    var isNewInvitation = false;
    if (currentWarData.attack == undefined || currentWarData.attack.leader == "") { //If it doesn't exist
        isNewInvitation = true;
        log.debug("A new WarAttack was created.");
    } else {
        if (handlers.CheckExpirationForWarAttack({ attackerGuildId: myGuild.Id })) { //If has just expired
            isNewInvitation = true;
            log.debug("Since last invitation expired, a new Battle Invitation was created.");
        }
    }

    if (isNewInvitation) {
        currentWarData.attack = newAttack;
    } else {
        if (!currentWarData.attack.participants.includes(myEntityId) && currentWarData.attack.leader != myEntityId) {
            currentWarData.attack.participants.push(myEntityId);
        }
    }

    //invitation.successful = invitation.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader!*/;

    entity.SetObjects({ Entity: { Id: myGuild.Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: currentWarData }] });
    log.debug("WarAttack updated: " + JSON.stringify(currentWarData.attack));
    return 1;
}

handlers.RestoreWarEnergy = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);
    const myGuildId = GetMyGuild(myEntityId).Id;
    const warData = GetMyGuildObjects(myEntityId).warData.DataObject;

    if (warData.energy == null) {
        warData.energy = { remainingWars: 8, lastRestorationDay: new Date().toUTCString() };
        entity.SetObjects({ Entity: { Id: myGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
        log.debug("Created war energy object", warData.energy);
        return 1;
    }

    const today = new Date();
    const saved = warData.energy.lastRestorationDay;

    if (GetYear(saved) <= today.getFullYear()) {
        if (GetMonth(saved) <= today.getMonth() + 1) {
            if (GetDay(saved) < today.getDate()) {
                // Restore energy
                warData.energy = { remainingWars: 8, lastRestorationDay: new Date().toUTCString() };
                entity.SetObjects({ Entity: { Id: myGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
                log.debug("Energy restored successfuly", warData.energy);
                return 1;
            }
            else {
                log.debug("Energy not restored: SAME DAY or FUTURE DAY");
                return -1;
            }
        }
        else {
            log.debug("Energy not restored: FUTURE MONTH?");
            var month = today.getMonth() + 1;
            log.debug("Saved: $GetMonth(saved) Today: $month + 1");
            return -1;
        }
    }

    log.debug("Energy not restored: FUTURE YEAR?");
    return -1;
}

GetYear = function (args) {
    var date = args.split(' ');
    return date[3];
}

GetMonth = function (args) {
    var date = args.split(' ');
    var months = ["NoMonth", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months.indexOf(date[2]);
}

GetDay = function (args) {
    var date = args.split(' ');
    return date[1];
}

handlers.DefendGuild = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);
    const warData = GetMyGuildObjects(myEntityId).warData.DataObject;

    if (warData.defense == null || warData.defense == {}) return -1;

    if (warData.defense.participants.includes(myEntityId)) return -2; //already entered

    warData.defense.participants.push(myEntityId);
    // entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });

    const playerPerformances = {};

    for (let i = 0; i < defense.participants.length; i++) {
        const player = participants[i];
        playerPerformances[player] = { kills: 0, level: 1 }; //level not considered yet.
    }

    warData.pool.playerPerformances = playerPerformances;

    // entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: warPool }] });
    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });

    return 1;
}


handlers.DieDuringWar = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);

    const guildObjects = GetMyGuildObjects(myEntityId);

    const warData = guildObjects.warData.DataObject;

    const warAttack = warData.attack;

    if (warAttack.successful && warAttack.defenderGuildId != "") {
        if (warAttack.participants.includes(myEntityId) || warAttack.leader == myEntityId) {
            if (warAttack.deaths == null) {
                warAttack.deaths = [];
            }
            if (!warAttack.deaths.includes(myEntityId)) {
                warAttack.deaths.push(myEntityId);
                warData.attack = warAttack;
                entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
                log.debug("DEATH ADDDED TO ATTACK DATA");
                return;
            }
        }
    }

    const warDefense = warData.defense;

    if (warDefense.attackerGuildId.length > 1) { //validate defense
        if (warDefense.deaths == null) {
            warDefense.deaths = [];
        }
        if (warDefense.participants.includes(myEntityId)) {
            if (!warDefense.deaths.includes(myEntityId)) {
                warDefense.deaths.push(myEntityId);
                warData.defense = warDefense;
                entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
                log.debug("DEATH ADDDED TO DEFENSE DATA");
                return;
            }
        }
    }

    log.debug("DEATH NOT ADDED TO REGISTRY");
    return;
}
//// LLEGUÉ HASTA AQUÍ 👈👈👈👈👈👈👈👈👈👈👈👈👈👈👈👈

handlers.FinishWar = function (args) {
    if (args.attackerGuild == null || args.attackerGuild == "") {
        log.debug("attackerGuildId is null or empty");
        return -2;
    }

    const myEntityId = GetEntityId(currentPlayerId);
    const attackerGuildId = args.attackerGuild;
    const didAttackersWon = args.won; //bool
    return FinishWar(attackerGuildId, didAttackersWon, myEntityId);
}

FinishWar = function (attackerGuildId, didAttackersWon, myEntityId) {
    log.debug("Finish war was called. AttackerGuildId: " + attackerGuildId + " | DidAttackersWon: " + didAttackersWon + " | MyEntityId: " + myEntityId);
    const attackerGuildObjects = GetGuildObjects(attackerGuildId);
    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    const COST = config.COST; //[]

    const attackerWarData = attackerGuildObjects.warData.DataObject;
    const attackerAttack = attackerWarData.attack;

    const defenderGuildId = attackerAttack.defenderGuildId;
    if (defenderGuildId == null || defenderGuildId == "" || !attackerAttack.successful) {
        log.debug("Defender guild id is null or attack was never successful.");
        attackerWarData.attack = {
            successful: false,
            defenderGuildId: "",
            leader: "",
            date: new Date(1999, 1, 1).toUTCString(),
            participants: [],
            deaths: []
        };
        entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: attackerWarData }] });
        log.debug("WarAttack has been reset.");
        return -2;
    }
    const defenderGuildObjects = GetGuildObjects(defenderGuildId);
    const defenderWarData = defenderGuildObjects.warData.DataObject;
    const defenderDefense = defenderWarData.defense;

    if (attackerAttack.participants.includes(myEntityId) || attackerAttack.leader == myEntityId || defenderDefense.participants.includes(myEntityId)) {
        log.debug("Will Split War Points...");
        const attackerCurrencyCost = COST[attackerGuildObjects.stats.DataObject.level - 1];
        const defenderCurrencyCost = COST[defenderGuildObjects.stats.DataObject.level - 1];

        const warCost = didAttackersWon ? defenderCurrencyCost : attackerCurrencyCost;
        try {
            SplitWarPoints(attackerGuildId, didAttackersWon, false, warCost);
            log.debug("Attacker War Points assigned...");
            SplitWarPoints(defenderGuildId, !didAttackersWon, true, warCost);
            log.debug("Defender War Points assigned...");
        } catch (error) {
            log.debug("SplitWarPoints was not executed. " + error)
        }

        const updatedAttackerWarData = GetGuildObjects(attackerGuildId).warData.DataObject;

        const newAttack = { leader: "", participants: [], successful: false, date: new Date(2000, 1, 1).toUTCString(), defenderGuildId: "" };
        log.debug("WarAttack will be cleared...");
        updatedAttackerWarData.attack = newAttack;
        entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: updatedAttackerWarData }] });

        const updatedDefenderWarData = GetGuildObjects(defenderGuildId).warData.DataObject;

        const newDefense = { date: new Date(2000, 1, 1).toUTCString(), participants: [], attackerGuildId: "" };
        log.debug("WarDefense will be cleared...");
        updatedDefenderWarData.defense = newDefense;
        entity.SetObjects({ Entity: { Id: defenderGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: updatedDefenderWarData }] });
        const defenderStats = defenderGuildObjects.stats.DataObject;
        defenderStats.shield = new Date().toUTCString();
        defenderStats.shieldDuration = 7200;
        entity.SetObjects({ Entity: { Id: defenderGuildId, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: defenderStats }] });
        return 1; //War finished successfully
    } else {
        log.debug("Player is not a participant or method was already called by another player.");
        return -3; //Player is not a participant or method was already called by another player.
    }
}

handlers.CollectWarPoints = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);
    const guildObjects = GetMyGuildObjects(myEntityId);

    const warData = guildObjects.warData.DataObject;
    const pool = warData.pool;
    if (pool == null) {
        log.debug("Pool is null");
        return;
    }
    if (pool.points[myEntityId] != null) {
        server.UpdatePlayerStatistics({ PlayFabId: currentPlayerId, Statistics: [{ StatisticName: "WAR_POINTS", Value: pool.points[myEntityId] }] });
        delete pool.points[myEntityId];
    } else {
        log.debug("Player is not eligible for WarPoints.")
    }
    if (pool.tachyon[myEntityId] != null) {
        server.AddUserVirtualCurrency({ PlayFabId: currentPlayerId, Amount: pool.tachyon[myEntityId], VirtualCurrency: "TK" })
        delete pool.tachyon[myEntityId];
    } else {
        log.debug("Player is not eligible for Tachyon reward.")
    }
    if (!pool.currencyClaimed) {
        guildObjects.stats.DataObject.currency += Number(pool.currency);
        entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: guildObjects.stats.DataObject }] });
        pool.currencyClaimed = true;
    }
    warData.pool = pool;
    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
}

SplitWarPoints = function (guildId, won, defending, currencyReward) {
    log.debug("SplitWarPoints called, guild id: " + guildId + " has won?: " + won + " is defending?:" + defending);

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    const WINNER_POOL = config.WINNER_POOL;
    const LOSER_POOL = config.LOSER_POOL;

    const warData = GetGuildObjects(guildId).warData.DataObject;

    const points = {};
    const tachyon = {};

    log.debug("SplitWarPoints, guildObjects", warData);

    var multiplierSum = 0;

    if (defending) {
        if (warData.defense == null) {
            log.debug("SplitWarPoints: battleDefense is null");
            return;
        }
        var count = warData.defense.participants.length;
        if (count == 0) {
            log.debug("SplitWarPoints: defender has no participants");
            return;
        }
        for (let i = 0; i < count; i++) {
            const participant = warData.defense.participants[i];
            if (participant == undefined) continue;
            multiplierSum += Number(GetNFTMultiplier(participant));
            tachyon[participant] = won ? 10 : 4;
        }
        var reward = won ? WINNER_POOL / multiplierSum : LOSER_POOL / multiplierSum;
        for (let i = 0; i < count; i++) {
            const participant = warData.defense.participants[i];
            if (participant == undefined) continue;
            points[participant] = reward * Number(GetNFTMultiplier(participant));
        }

    } else { //Attacking
        if (warData.attack == null) {
            log.debug("Split war points: battle invitation is null")
            return;
        }
        var count = warData.attack.participants.length + 1;
        var reward = won ? WINNER_POOL / count : LOSER_POOL / count;

        const leader = warData.attack.leader;

        for (let i = 0; i < count; i++) {
            const participant = warData.attack.participants[i];
            if (participant == undefined) continue;
            multiplierSum += Number(GetNFTMultiplier(participant));
            tachyon[participant] = won ? 10 : 4;
        }
        if (leader != undefined) {
            multiplierSum += Number(GetNFTMultiplier(leader));
        }
        var reward = won ? WINNER_POOL / multiplierSum : LOSER_POOL / multiplierSum;
        for (let i = 0; i < count; i++) {
            const participant = warData.attack.participants[i];
            if (participant == undefined) continue;
            points[participant] = reward * Number(GetNFTMultiplier(participant));
        }
        if (leader != undefined) {
            points[leader] = reward * Number(GetNFTMultiplier(leader));
            tachyon[leader] = won ? 10 : 4;
        }
    }

    const newPool = {};
    newPool.points = points;
    newPool.tachyon = tachyon;
    newPool.currency = currencyReward * (won ? 1 : -1); //Win or lose
    newPool.currencyClaimed = false;
    if (newPool.playerPerformances == undefined) {
        newPool.playerPerformances = {};
    }
    log.debug("New pool:" + JSON.stringify(newPool));
    warData.pool = newPool;
    entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
}

handlers.KillDuringWar = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);

    const warData = GetMyGuildObjects(myEntityId).warData.DataObject;

    const pool = warData.pool;
    var performance = pool.playerPerformances[myEntityId];
    if (performance == undefined) {
        performance = { kills: 1, level: 1 };
    } else {
        log.debug("Player performance detected.", performance);
        performance.kills = performance.kills + Number(1);
    }

    pool.playerPerformances[myEntityId] = performance;
    warData.pool = pool;

    entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });

}

GetMyGuildObjects = function (playerId) {
    const myGuild = GetMyGuild(playerId);
    if (myGuild == null) return null;
    return GetGuildObjects(myGuild.Id);
}

GetGuildObjects = function (guildId, defaultRegion = "sa") {
    const getObjectsResult = entity.GetObjects({ Entity: { Id: guildId, Type: "group" } });

    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("PlayerGuild has no objects");
        return null;
    }

    const myGuildObjects = getObjectsResult.Objects;
    //Verify data integrity!
    if (myGuildObjects.stats == null || myGuildObjects.stats.DataObject == null) {
        var planetNames = server.GetTitleData({ Keys: ["planetNames"] }).Data.planetNames;
        planetNames = JSON.parse(planetNames);
        var index = Math.floor(Math.random() * planetNames.length);
        const chosenPlanet = planetNames[index];

        const stats = {
            region: defaultRegion,
            planet: chosenPlanet,
            baseScene: "Bioma1_3",
            currency: 0,
            level: 0,
            shield: new Date(1999, 1, 1).toUTCString()
        }
        log.debug("Stats assigned for guild " + guildId);
        entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: stats }] });
    }
    if (myGuildObjects.purchases == null || myGuildObjects.purchases.DataObject == null) {
        const purchases = {};
        log.debug("Purchases assigned for guild " + guildId);
        entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "purchases", DataObject: purchases }] });
    }
    if (myGuildObjects.warData == null || myGuildObjects.warData.DataObject == null) {
        const warData = {};
        warData.attack = {
            defenderGuildId: "",
            leader: "",
            date: new Date(1999, 1, 1).toUTCString(),
            participants: [],
            successful: false,
            deaths: []
        };
        warData.defense = {
            attackerGuildId: "",
            date: new Date(1999, 1, 1).toUTCString(),
            participants: [],
            deaths: []
        }
        warData.pool = {
            points: {},
            tachyon: {},
            currency: 0,
            currencyClaimed: true,
            playerPerformances: {}
        }
        warData.energy = {
            remainingWars: 8,
            lastRestorationDay: new Date().toUTCString()
        }
        log.debug("WarData assigned for guild " + guildId);
        entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
    }

    return myGuildObjects;
}

GetMyGuild = function (playerId) {
    const allMyGuilds = entity.ListMembership({ Entity: { Id: playerId, Type: "title_player_account" } });
    var myGuild = allMyGuilds.Groups[0];

    if (myGuild == null || myGuild === undefined) {
        log.debug("Current player is not in a guild", allMyGuilds);
        return null; //Player is not in a guild
    }
    return myGuild.Group;
}

handlers.GetGuildObjects = function (args) {
    const guildId = args.guildId;
    return GetGuildObjects(guildId);
}

handlers.AssignRandomGuild = function (args) {
    const userInfo = server.GetUserAccountInfo({ PlayFabId: currentPlayerId }).UserInfo;
    const myEntity = userInfo.TitleInfo.TitlePlayerAccount;

    const allMyGuilds = entity.ListMembership({ Entity: myEntity });
    if (allMyGuilds.Groups.length > 0) {
        log.debug("Player is already in a group.");
        return;
    }

    const publicGuilds = server.GetTitleData({ Keys: "publicGuilds" }).Data.publicGuilds;
    const allGuilds = JSON.parse(publicGuilds);
    var max = allGuilds.length;
    var chosenGuild = Math.floor(Math.random() * max);
    log.debug("Total guild: " + allGuilds.length);
    log.debug("Chosen guild[" + chosenGuild + "]:", allGuilds[chosenGuild].id);

    entity.AddMembers({ Group: { Id: allGuilds[chosenGuild].id, Type: "group" }, Members: [myEntity], RoleId: "members" });
}

handlers.AssignRegionGuild = function (args) {
    const region = args.region;
    const myEntityId = GetEntityId(currentPlayerId);
    const myEntityKey = { Id: myEntityId, Type: "title_player_account" };
    const myGuild = GetMyGuild(myEntityId);

    if (region == null) {
        log.debug("No region was sent as parameter. Available regions are {sa, us, asia, jp, eu, kr}");
        return false;
    }
    if (myGuild != null) {
        log.debug("Player will be removed from guild " + myGuild.Id);
        entity.RemoveMembers({ Group: myGuild, Members: [myEntityKey] });
    }

    const publicGuilds = server.GetTitleData({ Keys: "publicGuilds" }).Data.publicGuilds;
    const allGuilds = JSON.parse(publicGuilds);

    const guildsFromRegion = [];

    for (let i = allGuilds.length - 1; i >= 0; i--) {
        if (allGuilds[i].region == region) {
            guildsFromRegion.push(allGuilds[i]);
        }
    }

    var guildCount = guildsFromRegion.length;

    if (guildCount == 0) {
        CreateGuild(region, myEntityId);
        log.debug("There is no guild in selected region. A new guild will be created.");
        return true;
    }

    for (let i = guildCount - 1; i >= 0; i--) {
        var count = 0;
        const chosenGuild = guildsFromRegion[i];
        var roles = entity.ListGroupMembers({ Group: { Id: chosenGuild.id, Type: "group" } }).Members;
        for (let j = 0; j < roles.length; j++) {
            count += Number(roles[j].Members.length);
        }
        if (count >= 10) {
            if (i == 0) {
                CreateGuild(region, myEntityId);
                log.debug("There is no guild with enough space available in this region. A new guild will be created.");
                return true;
            }
        } else {
            log.debug("Player will be added to guild " + chosenGuild.name + " that has a member count of " + count);
            entity.AddMembers({ Group: { Id: chosenGuild.id, Type: "group" }, Members: [myEntityKey], RoleId: "members" });
            return true;
        }
    }

    log.debug("Unknown error adding player to guild...");
    return false;
}

handlers.CreateNewGuild = function (args) {
    CreateGuild(args.region, args.admin);
}

CreateGuild = function (region, admin) {
    let guildNames = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa",
        "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Ypsilon", "Phi", "Ji", "Psi", "Omega",
        "Neutron", "Electron", "Proton", "Lighting", "Void", "Ultimates", "Pulse", "Brave", "Dread Hunters", "Steel", "Hollow",
        "Wolves", "Bears", "Sharks", "Killers", "Legends"];

    const titleData = server.GetTitleData({ Keys: "publicGuilds" }).Data.publicGuilds;
    const publicGuilds = JSON.parse(titleData);

    for (let i = 0; i < publicGuilds.length; i++) {
        const guildName = publicGuilds[i].name;
        var index = guildNames.indexOf(guildName);
        guildNames.splice(index, 1);
    }

    var index = Math.floor(Math.random() * guildNames.length);
    const chosenName = guildNames[index];
    log.debug("The chosen name for the new guild is " + chosenName);
    const createdGroup = entity.CreateGroup({ GroupName: chosenName, Entity: { Id: admin, Type: "title_player_account" } });
    const guildId = createdGroup.Group.Id;
    log.debug("The id for the new guild is " + guildId);
    GetGuildObjects(guildId, region);
    publicGuilds.push({ id: guildId, name: chosenName, region: region });
    server.SetTitleData({ Key: "publicGuilds", Value: JSON.stringify(publicGuilds) });
    log.debug("Guild was created and added to list of public guilds");
}

handlers.DonateCurrencyToGuild = function (args) {

    var currencyName = args.currencyName;
    var amount = args.amount;

    var donation = server.GetUserInventory({ PlayFabId: currentPlayerId }).VirtualCurrency[currencyName];
    if (donation > amount) {
        donation = amount; //Clamp value
    }

    ///TODO: Conversion factor, by now we will assume 1:1
    const conversionFactor = { TK: 1, QS: 1, YR: 1 };
    donation *= conversionFactor[currencyName];

    if (donation > 0) {
        var myEntityId = GetEntityId(currentPlayerId);

        var guildObjects = GetMyGuildObjects(myEntityId);

        var stats = guildObjects.stats.DataObject;

        var guildCurrency = 0;
        if (stats.currency != null) {
            guildCurrency += Math.floor(stats.currency);
        }

        log.debug(guildCurrency + "+" + donation + " = " + (guildCurrency + donation));

        guildCurrency += Math.floor(donation);

        stats.currency = guildCurrency;

        entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: stats }] });

        server.SubtractUserVirtualCurrency({ Amount: donation, PlayFabId: currentPlayerId, VirtualCurrency: currencyName });
    }
}

handlers.DonateItemToGuild = function (args) {

    //This function demands the item to be stackabled and consumable.

    var itemId = args.itemId;
    var amount = args.amount;

    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory; //ItemInstance[]

    var donation = 0;
    var itemInstanceId;

    for (let i = 0; i < inventory.length; i++) {
        const item = inventory[i];
        if (item.ItemId == itemId) {
            var usesLeft = item.RemainingUses;
            if (usesLeft > amount) {
                usesLeft = amount;
            }
            log.debug("Player has " + usesLeft + " uses left from this item.");
            donation += Math.floor(usesLeft);
            itemInstanceId = item.ItemInstanceId;
            break;
        }
    }

    if (donation > 0) {
        var myEntityId = GetEntityId(currentPlayerId);

        var guildObjects = GetMyGuildObjects(myEntityId);

        var stats = guildObjects.stats.DataObject;

        var guildCurrency = 0;
        if (stats.currency != null) {
            guildCurrency += Math.floor(stats.currency);
        }

        log.debug(guildCurrency + "+" + donation + " = " + (guildCurrency + donation));

        guildCurrency += Math.floor(donation);

        stats.currency = guildCurrency;

        entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: stats }] });

        server.ConsumeItem({ ConsumeCount: donation, ItemInstanceId: itemInstanceId, PlayFabId: currentPlayerId });
    }
}

//Technically, this will not be called by a player becuase a voting system will be implemented
handlers.UpgradeSpaceFortress = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);
    const guildObjects = GetMyGuildObjects(myEntityId);
    const stats = guildObjects.stats.DataObject;

    var guildCurrency = 0;
    if (stats.currency != null) {
        guildCurrency += Math.floor(stats.currency);
    }

    var guildLevel = 1;
    if (stats.level != null) {
        guildLevel += Math.floor(stats.level) - 1;
    }


    var config = server.GetTitleData({ Keys: ["spaceFortressLevels"] }).Data.spaceFortressLevels;
    config = JSON.parse(config);

    if (guildLevel == config.length) {
        log.debug("Guild level is the maximum level.");
        return false;
    }
    var cost = config[guildLevel].cost;
    if (guildCurrency < cost) {
        log.debug("Guild currency is lower than upgrade cost.");
        return false;
    }

    stats.level = guildLevel + 1;
    stats.currency = guildCurrency - cost;

    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: stats }] });
    log.debug("Guild successfully upgraded from level " + guildLevel + " to level " + (guildLevel + 1));
    return true;
}

RestoreShield = function (guildId) {
    const stats = GetGuildObjects(guildId).stats.DataObject;
    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);

    const SHORT_DURATION = 7200;
    const LONG_DURATION = 21600;

    const currentShieldLife = (Date.now() - Date.parse(stats.shield)) / 1000;

    if (stats.shieldDuration == null) {
        stats.shieldDuration = LONG_DURATION;
    }

    if (stats.shieldDuration == LONG_DURATION || stats.shieldDuration == (LONG_DURATION + SHORT_DURATION)) {
        if (currentShieldLife < stats.shieldDuration) return false; //A shield is already active, so players can't purchase another one.
        stats.shield = new Date().toUTCString();
    }

    if (stats.shieldDuration == SHORT_DURATION) {
        if (currentShieldLife < stats.shieldDuration) {
            stats.shieldDuration = LONG_DURATION + SHORT_DURATION; //An automatic shield is still doing its job, purchased shield will increase duration.
        } else {
            stats.shieldDuration = LONG_DURATION; //An automatic shield expired, so a long-duration one will be created.
            stats.shield = new Date().toUTCString();
        }
    }

    entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: stats }] });
    return true;
}

handlers.VoteForPurchase = function (args) {
    const myEntityId = GetEntityId(currentPlayerId);
    const guildId = GetMyGuild(myEntityId).Id;
    const guildObjects = GetMyGuildObjects(myEntityId);

    const purchasesObject = guildObjects.purchases;

    if (purchasesObject != null) {
        var purchases = guildObjects.purchases.DataObject;
    } else {
        var purchases = {};
    }

    if (purchases == null) {
        purchases = {};
    }

    const item = args.item; //Id of the item to purchase (upgrade, shield, etc).

    addPlayer: {
        if (purchases[item] == null) {
            purchases[item] = [myEntityId];
        } else {
            if (purchases[item].includes(myEntityId)) {
                log.debug("Player has already voted for this purchase.");
                break addPlayer;
            }
            purchases[item].push(myEntityId);
        }
    }

    purchasing: {
        if (purchases[item].length >= 4) {
            if (item == "upgrade") {
                var upgradeTry = handlers.UpgradeSpaceFortress();
                if (!upgradeTry) {
                    log.debug("Purchase failed.");
                    break purchasing;
                }
            }
            if (item == "shield") {
                var upgradeTry = RestoreShield(guildId);
                if (!upgradeTry) {
                    log.debug("Purchase failed.");
                    break purchasing;
                }

            }
            log.debug("Purchase of " + item + " succeded!");
            purchases[item] = [];
        } else {
            log.debug("Player voted for purchase.");
        }
    }

    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "purchases", DataObject: purchases }] });
    return;
}