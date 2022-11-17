////////////// GUILDS

handlers.CheckExpirationForBattleInvitation = function (args) {

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    var MIN_ATTACKERS = config.MIN_ATTACKERS;
    var WAR_DURATION = config.WAR_DURATION;
    var INVITATION_DURATION = config.INVITATION_DURATION;
    var COST = config.COST; //[]
    var attackerGuildId = args.attackerGuildId;
    var groupObjectData = entity.GetObjects({
        Entity: { Id: attackerGuildId, Type: "group" }
    });

    var expired = false;
    var failed = true;
    var attackerGuildObjects = groupObjectData.Objects;
    if (attackerGuildObjects.battleInvitation !== undefined) {
        var invitation = attackerGuildObjects.battleInvitation.DataObject;
        if (invitation == "") {
            log.debug("The BatlleInvitation expired previously.")
            expired = true;
        }
        var timeSinceCreated = (Date.now() - Date.parse(invitation.date)) / 1000;
        if (timeSinceCreated >= INVITATION_DURATION) {
            log.debug("The BatlleInvitation has expired.")

            if (invitation.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader*/) {
                var battleDuration = timeSinceCreated - INVITATION_DURATION;
                log.debug("Battle duration: " + battleDuration + " | successful? " + invitation.successful, invitation);
                if (battleDuration >= WAR_DURATION) { //War should have ended
                    log.debug("The Guild War should have ended.");
                    if (attackerGuildId != null && invitation.successful) {
                        handlers.FinishWar({ attackerGuild: attackerGuildId, won: false });
                    }
                    failed = true;
                } else if (!invitation.successful || invitation.successful == undefined) {
                    //DISCOUNT RED ROCKS
                    var stats = attackerGuildObjects.stats.DataObject;
                    log.debug("Stats:" + JSON.stringify(stats));
                    if (stats.level == undefined) {
                        stats.level = 1;
                    }
                    var requiredRocks = Number(COST[Number(stats.level) - 1]);
                    log.debug("Guild currency: " + stats.currency + " | Cost: " + requiredRocks);
                    if (stats.currency >= requiredRocks) {

                        /*{ I'm pretty sure this will be requested again ¬¬ 
                            stats.currency -= discount;
                            entity.SetObjects({
                                Entity: { Id: attackerGuildId, Type: "group" },
                                Objects: [{ ObjectName: "stats", DataObject: stats }],
                                CustomTags: { Event: "Discount currency from guild to start a war.", Discount: discount }
                            }); //Discount Red Rocks.
                        }/*/

                        log.debug("The battle invitation was successful and a GuildWar started.");
                        failed = false;
                        var originalDefense = GetGuildObjects(invitation.guildId).battleDefense
                        if (originalDefense == null || originalDefense == undefined) {
                            originalDefense = { date: new Date(2000, 1, 1), participants: [], attackerGuildId: "" };
                        } else {
                            originalDefense = originalDefense.DataObject;
                            log.debug("Defender data:\nAttackerGuild: " + originalDefense.attackerGuildId);
                        }
                        //if (originalDefense.attackerGuildId.length < 2 || (new Date() - Date.parse(originalDefense.date)) / 1000 > WAR_DURATION) { //null or empty
                        invitation.successful = true;
                        //Create battle defense in defender guild.
                        var defense = { date: new Date().toUTCString(), participants: [], attackerGuildId: attackerGuildId, deaths: [] };
                        entity.SetObjects({ Entity: { Id: invitation.guildId, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });
                        //}

                        //Create player performances
                        attakcers: {
                            var originalParticipants = [...invitation.participants];
                            originalParticipants.push(invitation.leader);

                            var attackerPlayerPerformances = {};

                            for (let index = 0; index < originalParticipants.length; index++) {
                                const player = originalParticipants[index];
                                attackerPlayerPerformances[player] = { kills: 0, level: 1 }; //level not considered yet.
                            }

                            var warPool = attackerGuildObjects.warPool.DataObject;
                            warPool.playerPerformances = attackerPlayerPerformances;

                            entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: warPool }] });
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
                invitation.successful = false;
                invitation.participants = [];
                invitation.leader = "";
                invitation.guildId = "";
                invitation.deaths = [];
                invitation.date = new Date(2000, 1, 1).toUTCString();
            }
            entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitation }] });
            expired = true;

        } else {
            expired = false;
            log.debug("The BatlleInvitation has not expired yet.")
            expired = false;
        }
    } else {
        log.debug("The BatlleInvitation doesn't exist.")
        expired = true;
    }

    return expired;
}

handlers.AcceptOrCreateBattleInvitation = function (args) {
    var userInfo = server.GetUserAccountInfo({ PlayFabId: currentPlayerId }).UserInfo;
    var myEntity = userInfo.TitleInfo.TitlePlayerAccount;
    var myEntityId = myEntity.Id;
    var targetedGuildId = args.targetedGuildId; //this could be null
    var date = args.date;

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    var MIN_ATTACKERS = config.MIN_ATTACKERS;

    var myGuild = GetMyGuild(myEntityId);
    var myGuildObjects = GetMyGuildObjects(myEntityId);

    var isNewInvitation = false;
    if (myGuildObjects.battleInvitation === undefined) { //If it doesn't exist
        isNewInvitation = true;
        log.debug("A new Battle Invitation was created.")
        myGuildObjects.battleInvitation = { ObjectName: "battleInvitation", DataObject: {} };
    } else {
        if (handlers.CheckExpirationForBattleInvitation({ attackerGuildId: myGuild.Id })) { //If has just expired
            isNewInvitation = true;
            log.debug("Since last invitation expired, a new Battle Invitation was created.")
            myGuildObjects.battleInvitation = { ObjectName: "battleInvitation", DataObject: {} };
        }
    }

    var invitation = myGuildObjects.battleInvitation.DataObject;

    invitation.guildId = targetedGuildId;
    if (isNewInvitation) {
        invitation.leader = myEntityId;
        invitation.date = date;
    }

    if (invitation.participants == null) invitation.participants = [];

    if (!invitation.participants.includes(myEntityId) && invitation.leader != myEntityId) {
        invitation.participants.push(myEntityId);
    }
    //invitation.successful = invitation.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader!*/;

    entity.SetObjects({ Entity: { Id: myGuild.Id, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitation }] });
    return 1;
}

handlers.DefendGuild = function (args) {
    var myEntityId = args.myEntityId;
    var defenderGuildObjects = GetMyGuildObjects(myEntityId);

    if (defenderGuildObjects.battleDefense == null) return -1;
    var defense = defenderGuildObjects.battleDefense.DataObject;

    if (defense.participants.includes(myEntityId)) return -2; //already entered

    defense.participants.push(myEntityId);
    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });

    var defenderPlayerPerformances = {};

    for (let index = 0; index < defense.participants.length; index++) {
        const player = participants[index];
        defenderPlayerPerformances[player] = { kills: 0, level: 1 }; //level not considered yet.
    }

    var warPool = defenderGuildObjects.warPool.DataObject;
    warPool.playerPerformances = defenderPlayerPerformances;

    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: warPool }] });

    return 1;
}

handlers.DieDuringWar = function (args) {
    var userInfo = server.GetUserAccountInfo({ PlayFabId: currentPlayerId }).UserInfo;
    var myEntity = userInfo.TitleInfo.TitlePlayerAccount;
    var myEntityId = myEntity.Id;

    var objects = GetMyGuildObjects(myEntityId);

    var invitation = objects.battleInvitation;
    if (invitation != null) {
        var invitationData = invitation.DataObject;
        if (invitationData.successful) {
            if (invitationData.participants.includes(myEntityId) || invitationData.leader == myEntityId) {
                if (invitationData.deaths == null) {
                    invitationData.deaths = [];
                }
                if (!invitationData.deaths.includes(myEntityId)) {
                    invitationData.deaths.push(myEntityId);
                    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitationData }] });
                    return "DEATH ADDDED TO ATTACK/INVITATION DATA";
                }
            }
        }
    }

    var defense = objects.battleDefense;
    if (defense != null) {
        var defenseData = defense.DataObject;
        if (defenseData.attackerGuild.length > 1) { //validate defense
            if (defenseData.deaths == null) {
                defenseData.deaths = [];
            }
            if (defenseData.participants.includes(myEntityId)) {
                if (!defenseData.deaths.includes(myEntityId)) {
                    defenseData.deaths.push(myEntityId);
                    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defenseData }] });
                    return "DEATH ADDDED TO DEFENSE DATA";
                }
            }
        }
    }
    return "DEATH NOT ADDED TO REGISTRY";
}

handlers.FinishWar = function (args) {

    if (args.attackerGuild == null || args.attackerGuild == "") {
        return -2;
    }

    var attackerGuildId = args.attackerGuild;
    var didAttackersWon = args.won; //bool

    var myEntityId = GetEntityId(currentPlayerId);

    var attackerGuildObjects = GetGuildObjects(attackerGuildId);

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    var COST = config.COST; //[]

    if (attackerGuildObjects.battleInvitation != null) {
        var battleInvitation = attackerGuildObjects.battleInvitation.DataObject;
        var defenderGuildId = battleInvitation.guildId;
        log.debug("Defender guild id: " + defenderGuildId, battleInvitation);
        if (defenderGuildId == null || defenderGuildId == "") {
            log.debug("Defender guild id is null.");
            return -2;
        }
        var defenderGuild = GetGuildObjects(defenderGuildId);

        if (battleInvitation.participants.includes(myEntityId) || battleInvitation.leader == myEntityId || defenderGuild.battleDefense.DataObject.participants.includes(myEntityId)) {
            log.debug("Will Split War Points...");

            var attackerCurrencyCost = COST[attackerGuildObjects.stats.DataObject.level - 1];
            var defenderCurrencyCost = COST[defenderGuild.stats.DataObject.level - 1];

            var warCost = didAttackersWon ? defenderCurrencyCost : attackerCurrencyCost;
            try {
                SplitWarPoints(attackerGuildId, didAttackersWon, false, warCost);
                log.debug("Attacker War Points assigned...");
                SplitWarPoints(defenderGuildId, !didAttackersWon, true, warCost);
                log.debug("Defender War Points assigned...");
            } catch (error) {
                log.debug("SplitWarPoints was not executed. " + error)
            }

            var newInvitation = { leader: "", participants: [], successful: false, date: new Date(2000, 1, 1).toUTCString() };
            log.debug("BattleInvitation will be cleared...");
            entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: newInvitation }] });

            var newDefense = { date: new Date(2000, 1, 1).toUTCString(), participants: [], attackerGuildId: "" };
            log.debug("BattleDefense will be cleared...");
            entity.SetObjects({ Entity: { Id: defenderGuildId, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: newDefense }] });
            return 1; //War finished successfully, battleInvitation was reset.
        } else {
            return -3; //Player is not a participant or method was already called by another player.
        }
    } else {
        return -2; //Guild has no active invitation
    }
}

handlers.CollectWarPoints = function (args) {
    var playerEntityId = GetEntityId(currentPlayerId);
    var objects = GetMyGuildObjects(playerEntityId);
    log.debug("GuildObjects", objects);

    var pool = objects.warPool;
    if (pool == null) {
        log.debug("Pool is null");
        return;
    }
    var poolData = pool.DataObject;
    if (poolData == null) {
        log.debug("PoolData is null");
        return;
    }

    if (poolData.points[playerEntityId] != null) {
        server.UpdatePlayerStatistics({ PlayFabId: currentPlayerId, Statistics: [{ StatisticName: "WAR_POINTS", Value: poolData.points[playerEntityId] }] });
        delete poolData.points[playerEntityId];
    } else {
        log.debug("Player is not eligible for WarPoints.")
    }
    if (poolData.tachyon[playerEntityId] != null) {
        server.AddUserVirtualCurrency({ PlayFabId: currentPlayerId, Amount: poolData.tachyon[playerEntityId], VirtualCurrency: "TK" })
        delete poolData.tachyon[playerEntityId];
    } else {
        log.debug("Player is not eligible for Tachyon reward.")
    }
    if (!poolData.currencyClaimed) {
        objects.stats.DataObject.currency += Number(poolData.currency);
        entity.SetObjects({ Entity: { Id: GetMyGuild(playerEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "stats", DataObject: objects.stats.DataObject }] });
        poolData.currencyClaimed = true;
    }
    entity.SetObjects({ Entity: { Id: GetMyGuild(playerEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: poolData }] });
}

SplitWarPoints = function (guildId, won, defending, currencyReward) {
    log.debug("SplitWarPoints called, guild id: " + guildId + " has won?: " + won + " is defending?:" + defending);

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    var WINNER_POOL = config.WINNER_POOL;
    var LOSER_POOL = config.LOSER_POOL;

    var objects = GetGuildObjects(guildId);

    if (objects == null) {
        log.debug("Error spliting war points: guild has no objects.");
        return;
    }
    var points = {};
    var tachyon = {};

    log.debug("SplitWarPoints, guildObjects", objects);

    var multiplierSum = 0;

    if (defending) {
        if (objects.battleDefense == null) return;
        var count = objects.battleDefense.DataObject.participants.length;
        if (count == 0) return;
        for (let i = 0; i < count; i++) {
            const participant = objects.battleDefense.DataObject.participants[i];
            if (participant == undefined) continue;
            multiplierSum += Number(GetNFTMultiplier(participant));
            tachyon[participant] = won ? 10 : 4;
        }
        var reward = won ? WINNER_POOL / multiplierSum : LOSER_POOL / multiplierSum;
        for (let i = 0; i < count; i++) {
            const participant = objects.battleDefense.DataObject.participants[i];
            if (participant == undefined) continue;
            points[participant] = reward * Number(GetNFTMultiplier(participant));
        }

    } else { //Attacking
        if (objects.battleInvitation == null) return;
        var count = objects.battleInvitation.DataObject.participants.length + 1;
        if (count == 0) return;
        var reward = won ? WINNER_POOL / count : LOSER_POOL / count;

        const leader = objects.battleInvitation.DataObject.leader;

        for (let i = 0; i < count; i++) {
            const participant = objects.battleInvitation.DataObject.participants[i];
            if (participant == undefined) continue;
            multiplierSum += Number(GetNFTMultiplier(participant));
            tachyon[participant] = won ? 10 : 4;
        }
        if (leader != undefined) {
            multiplierSum += Number(GetNFTMultiplier(leader));
        }
        var reward = won ? WINNER_POOL / multiplierSum : LOSER_POOL / multiplierSum;
        for (let i = 0; i < count; i++) {
            const participant = objects.battleInvitation.DataObject.participants[i];
            if (participant == undefined) continue;
            points[participant] = reward * Number(GetNFTMultiplier(participant));
        }
        if (leader != undefined) {
            points[leader] = reward * Number(GetNFTMultiplier(player));
            tachyon[leader] = won ? 10 : 4;
        }
    }

    log.debug("New pool:", points);
    var dataObject = {};
    dataObject.points = points;
    dataObject.tachyon = tachyon;
    dataObject.currency = currencyReward * (won ? 1 : -1); //Win or lose
    dataObject.currencyClaimed = false;

    entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: dataObject }] });
    log.debug("Pool created.");
}

handlers.KillDuringWar = function (args) {
    var myEntityId = GetEntityId(currentPlayerId);

    var guildObjects = GetMyGuildObjects(myEntityId);

    var warPool = guildObjects.warPool.DataObject;
    var performance = warPool.playerPerformances[myEntityId];
    if (performance == undefined) {
        performance = { kills: 1, level: 1 };
    } else {
        log.debug("Player performance detected.", performance);
        performance.kills = performance.kills + Number(1);
    }

    warPool.playerPerformances[myEntityId] = performance;

    entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warPool", DataObject: warPool }] });

}

GetMyGuildObjects = function (playerId) {
    var myGuild = GetMyGuild(playerId);

    if (myGuild == null) return null;

    var getObjectsResult = entity.GetObjects({ Entity: myGuild });

    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("PlayerGuild has no objects");
        return null;
    }

    var myGuildObjects = getObjectsResult.Objects;
    return myGuildObjects;
}

GetGuildObjects = function (guildId) {
    var getObjectsResult = entity.GetObjects({ Entity: { Id: guildId, Type: "group" } });

    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("PlayerGuild has no objects");
        return null;
    }

    var myGuildObjects = getObjectsResult.Objects;
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
    var guildId = args.guildId;

    return GetGuildObjects(guildId);
}

handlers.AssignRandomGuild = function (args, context) {
    var userInfo = server.GetUserAccountInfo({ PlayFabId: currentPlayerId }).UserInfo;
    var myEntity = userInfo.TitleInfo.TitlePlayerAccount;

    var allMyGuilds = entity.ListMembership({ Entity: myEntity });
    if (allMyGuilds.Groups.length > 0) {
        log.debug("Player is already in a group.");
        return;
    }

    var titleData = server.GetTitleData({ Keys: "guilds" }).Data.guilds;
    var allGuilds = JSON.parse(titleData);
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
    var myEntityId = GetEntityId(currentPlayerId);
    var guildObjects = GetMyGuildObjects(myEntityId);
    var stats = guildObjects.stats.DataObject;

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