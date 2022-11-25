////////////// GUILDS

handlers.CheckExpirationForBattleInvitation = function (args) {

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
    }
    var timeSinceCreated = (Date.now() - Date.parse(warAttack.date)) / 1000;
    if (timeSinceCreated >= INVITATION_DURATION) {
        log.debug("The Invitation has expired.");
        if (warAttack.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader*/) {
            var warDuration = timeSinceCreated - INVITATION_DURATION;
            log.debug("War duration: " + warDuration + " of " + WAR_DURATION + " | successful? " + warAttack.successful, warAttack);
            if (warDuration >= WAR_DURATION) { //War should have ended
                log.debug("The Guild War should have ended.");
                //if (warAttack.successful) {
                FinishWar(attackerGuildId, false, myEntityId);
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
                        var originalParticipants = warAttack.participants;
                        originalParticipants.push(warAttack.leader);

                        const attackerPlayerPerformances = {};

                        for (let i = 0; i < originalParticipants.length; i++) {
                            const player = originalParticipants[i];
                            attackerPlayerPerformances[player] = { kills: 0, level: 1 }; //level not considered yet.
                        }
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
            warAttack.guildId = "";
            warAttack.deaths = [];
            warAttack.date = new Date(1999, 1, 1).toUTCString();
        }
        attackerWarData.attack = warAttack;
        try {
            entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: attackerWarData }] });
        } catch (error) {
            log.debug("Error: " + error)
        }
        expired = true;

    } else {
        expired = false;
        log.debug("The BatlleInvitation has not expired yet.")
        expired = false;
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
    const warData = GetMyGuildObjects(myEntityId).warData.DataObject;

    // CHECK IF GUILD HAS ENOUGH WAR ENERGY
    if (warData.energy != null) {
        if (warData.energy.remainingWars <= 0) {
            log.debug("Guild has no remaining wars available (war energy)");
            return -1;
        }
    }
    else {
        handlers.RestoreWarEnergy({});
    }

    const newAttack = {};
    newAttack.successful = false;
    newAttack.leader = myEntityId;
    newAttack.participants = [];
    newAttack.defenderGuildId = defenderGuildId;
    newAttack.deaths = [];
    newAttack.date = date;

    var isNewInvitation = false;
    if (warData.attack == undefined) { //If it doesn't exist
        isNewInvitation = true;
        log.debug("A new Battle Invitation was created.")
    } else {
        if (handlers.CheckExpirationForBattleInvitation({ attackerGuildId: myGuild.Id })) { //If has just expired
            isNewInvitation = true;
            log.debug("Since last invitation expired, a new Battle Invitation was created.")
        }
    }

    if (isNewInvitation) {
        warData.attack = newAttack;
    } else {
        if (!warData.attack.participants.includes(myEntityId) && warData.attack.leader != myEntityId) {
            warData.attack.participants.push(myEntityId);
        }
    }

    //invitation.successful = invitation.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader!*/;

    entity.SetObjects({ Entity: { Id: myGuild.Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
    log.debug("WarAttack created", warData.attack);
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

    const warAttack = guildObjects.battleInvitation;
    if (warAttack != null) {
        if (warAttack.successful && warAttack.defenderGuildId != "") {
            if (warAttack.participants.includes(myEntityId) || warAttack.leader == myEntityId) {
                if (warAttack.deaths == null) {
                    warAttack.deaths = [];
                }
                if (!warAttack.deaths.includes(myEntityId)) {
                    warAttack.deaths.push(myEntityId);
                    warData.attack = warAttack;
                    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
                    return "DEATH ADDDED TO ATTACK DATA";
                }
            }
        }
    }

    const warDefense = guildObjects.battleDefense;
    if (warDefense != null) {
        if (warDefense.attackerGuildId.length > 1) { //validate defense
            if (warDefense.deaths == null) {
                warDefense.deaths = [];
            }
            if (warDefense.participants.includes(myEntityId)) {
                if (!warDefense.deaths.includes(myEntityId)) {
                    warDefense.deaths.push(myEntityId);
                    warData.defense = warDefense;
                    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
                    return "DEATH ADDDED TO DEFENSE DATA";
                }
            }
        }
    }
    return "DEATH NOT ADDED TO REGISTRY";
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
    const attackerGuildObjects = GetGuildObjects(attackerGuildId);
    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    const COST = config.COST; //[]

    const attackerWarData = attackerGuildObjects.warData.DataObject;
    const attackerAttack = attackerWarData.attack;

    const defenderGuildId = attackerAttack.defenderGuildId;
    if (defenderGuildId == null || defenderGuildId == "") {
        log.debug("Defender guild id is null.");
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

        const newAttack = { leader: "", participants: [], successful: false, date: new Date(2000, 1, 1).toUTCString(), defenderGuildId: "" };
        log.debug("WarAttack will be cleared...");
        attackerWarData.attack = newAttack;
        entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: attackerWarData }] });

        const newDefense = { date: new Date(2000, 1, 1).toUTCString(), participants: [], attackerGuildId: "" };
        log.debug("WarDefense will be cleared...");
        defenderWarData.defense = newDefense;
        entity.SetObjects({ Entity: { Id: defenderGuildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: defenderWarData }] });
        return 1; //War finished successfully, battleInvitation was reset.
    } else {
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
    log.debug("New pool:", newPool);
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

GetGuildObjects = function (guildId) {
    const getObjectsResult = entity.GetObjects({ Entity: { Id: guildId, Type: "group" } });

    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("PlayerGuild has no objects");
        return null;
    }

    const myGuildObjects = getObjectsResult.Objects;
    //Verify data integrity!
    if (myGuildObjects.stats == null || myGuildObjects.stats.DataObject == null) {
        const stats = {};
        stats.region = "sa";
        stats.planet = "Canyon Forest";
        stats.baseScene = "Bioma1_3";
        stats.currency = 0;
        stats.level = 0;
        entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: stats }] });
    }
    if (myGuildObjects.purchases == null || myGuildObjects.purchases.DataObject == null) {
        const purchases = {};
        entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "purchases", DataObject: purchases }] });
    }
    if (myGuildObjects.warData == null || myGuildObjects.warData.DataObject == null) {
        const warData = {};
        warData.attack = {
            defenderGuildId: "",
            leader: "",
            date: "1999-01-01T00:00:00",
            participants: [],
            successful: false,
            deaths: []
        };
        warData.defense = {
            attackerGuildId: "",
            date: "1999-01-01T00:00:00",
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
        entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warData", DataObject: warData }] });
    }

    return myGuildObjects;
}

GetMyGuild = function (playerId) {
    var allMyGuilds = entity.ListMembership({ Entity: { Id: playerId, Type: "title_player_account" } });
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

    const titleData = server.GetTitleData({ Keys: "guilds" }).Data.guilds;
    const allGuilds = JSON.parse(titleData);
    var max = allGuilds.length;
    var chosenGuild = Math.floor(Math.random() * max);
    log.debug("Total guild: " + allGuilds.length);
    log.debug("Chosen guild[" + chosenGuild + "]:", allGuilds[chosenGuild]);

    entity.AddMembers({ Group: { Id: allGuilds[chosenGuild], Type: "group" }, Members: [myEntity], RoleId: "members" });
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

handlers.VoteForPurchase = function (args) {
    var myEntityId = GetEntityId(currentPlayerId);
    var guildObjects = GetMyGuildObjects(myEntityId);

    var purchasesObject = guildObjects.purchases;

    if (purchasesObject != null) {
        var purchases = guildObjects.purchases.DataObject;
    } else {
        var purchases = {};
    }

    if (purchases == null) {
        purchases = {};
    }

    var item = args.item; //Id of the item to purchase (upgrade, shield, etc).

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
            log.debug("Purchase of " + item + " succeded!");
            purchases[item] = [];
        } else {
            log.debug("Player voted for purchase.");
        }
    }

    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "purchases", DataObject: purchases }] });
    return;
}