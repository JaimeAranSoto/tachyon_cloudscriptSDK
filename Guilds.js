////////////// GUILDS

handlers.CheckExpirationForBattleInvitation = function (args) {

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    var MIN_ATTACKERS = config.MIN_ATTACKERS;
    var WAR_DURATION = config.WAR_DURATION;
    var INVITATION_DURATION = config.INVITATION_DURATION;
    var attackerGuildId = args.attackerGuildId;
    var groupObjectData = entity.GetObjects({
        Entity: { Id: attackerGuildId, Type: "group" }
    });

    var expired = false;

    var myGuildObjects = groupObjectData.Objects;
    if (myGuildObjects.battleInvitation !== undefined) {
        var invitation = myGuildObjects.battleInvitation.DataObject;
        if (invitation == "") {
            log.debug("The BatlleInvitation expired previously.")
            expired = true;
        }
        var timeSinceCreated = (Date.now() - Date.parse(invitation.date)) / 1000;
        if (timeSinceCreated >= INVITATION_DURATION) {
            log.debug("The BatlleInvitation is expired.")

            if (invitation.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader*/) {
                log.debug("The battle invitation was successful and a GuildWar started.");
                var battleDuration = timeSinceCreated - INVITATION_DURATION;
                log.debug("Battle duration: " + battleDuration);
                if (battleDuration >= WAR_DURATION) { //War should have ended
                    invitation.successful = false;
                    invitation.participants = [];
                    invitation.leader = "";
                    invitation.date = new Date(2000, 1, 1).toUTCString();
                } else {
                    invitation.successful = true;
                    //Create battle defense in defender guild.
                    var defense = { date: new Date().toUTCString(), participants: [], attackerGuildId: attackerGuildId };
                    entity.SetObjects({ Entity: { Id: invitation.guildId, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });
                }
            } else {
                invitation.successful = false;
                invitation.participants = [];
                invitation.leader = "";
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
    var myEntityId = args.myEntityId;
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
    invitation.successful = invitation.participants.length >= MIN_ATTACKERS - 1 /*Excluding leader!*/;

    entity.SetObjects({ Entity: { Id: myGuild.Id, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitation }] });
    return 1;
}

handlers.DefendGuild = function (args) {
    var myEntityId = args.myEntityId;
    var myGuildObjects = GetMyGuildObjects(myEntityId);

    if (myGuildObjects.battleDefense == null) return -1;
    var defense = myGuildObjects.battleDefense.DataObject;

    if (defense.participants.includes(myEntityId)) return -2; //already entered

    defense.participants.push(myEntityId);
    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });
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
    var attackerGuildId = args.attackerGuild;
    var didAttackersWon = args.won; //bool

    var userInfo = server.GetUserAccountInfo({ PlayFabId: currentPlayerId }).UserInfo;
    var myEntity = userInfo.TitleInfo.TitlePlayerAccount;
    var myEntityId = myEntity.Id;

    var attackerGuild = GetGuildObjects(attackerGuildId);

    if (attackerGuild.battleInvitation != null) {
        var invitation = attackerGuild.battleInvitation.DataObject;
        var defenderGuildId = invitation.guildId;
        var defenderGuild = GetGuildObjects(defenderGuildId);

        if (invitation.participants.includes(myEntityId) || invitation.leader == myEntityId || defenderGuild.battleDefense.DataObject.participants.includes(myEntityId)) {
            SplitWarPoints(attackerGuildId, didAttackersWon, false);
            SplitWarPoints(defenderGuildId, !didAttackersWon, true);

            var newInvitation = { leader: "", participants: [], successful: false, date: new Date(2000, 1, 1).toUTCString() };
            entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: newInvitation }] });

            var newDefense = { date: new Date(2000, 1, 1).toUTCString(), participants: [], attackerGuildId: "" };
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
    var playerEntityId = args.myEntityId;
    var objects = GetMyGuildObjects(playerEntityId);
    log.debug("GuildObjects", objects);

    var pool = objects.warPointsPool;
    if (pool == null) {
        log.debug("Pool is null");
        return;
    }
    var poolData = pool.DataObject;
    if (poolData == null) {
        log.debug("PoolData is null");
        return;
    }

    if (poolData[playerEntityId] != null) {
        server.UpdatePlayerStatistics({ PlayFabId: currentPlayerId, Statistics: [{ StatisticName: "WAR_POINTS", Value: poolData[playerEntityId] }] });
        delete poolData[playerEntityId];

        entity.SetObjects({ Entity: { Id: GetMyGuild(playerEntityId).Id, Type: "group" }, Objects: [{ ObjectName: "warPointsPool", DataObject: poolData }] });
    } else {
        log.debug("Player is not eligible for war points.")
    }

}

SplitWarPoints = function (guildId, won, defending) {
    log.debug("SplitWarPoints called, guild id: " + guildId + " has won?: " + won + " is defending?:" + defending);

    var config = server.GetTitleData({ Keys: ["warConfig"] }).Data.warConfig;
    config = JSON.parse(config);
    var WINNER_POOL = config.WINNER_POOL;
    var LOSER_POOL = config.LOSER_POOL;


    var getObjectsResult = entity.GetObjects({ Entity: { Id: guildId, Type: "group" } });

    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("Guild has no objects");
        return null;
    }
    var pool = {};
    var objects = getObjectsResult.Objects;

    log.debug("SplitWarPoints, guildObjects", objects);


    if (defending) {
        var division = objects.battleDefense.DataObject.participants.length;
        if (division == 0) return;
        var reward = won ? WINNER_POOL / division : LOSER_POOL / division;
        for (let i = 0; i < division; i++) {
            const player = objects.battleDefense.DataObject.participants[i];
            pool[player] = reward; //TODO: Check if has NFT and add multiplier system
        }
    } else { //Attacking
        var division = objects.battleInvitation.DataObject.participants.length;
        if (division == 0) return;
        var reward = won ? WINNER_POOL / division : LOSER_POOL / division;
        for (let i = 0; i < division; i++) {
            const player = objects.battleInvitation.DataObject.participants[i];
            pool[player] = reward; //TODO: Check if has NFT and add multiplier system
        }
        pool[objects.battleInvitation.DataObject.leader] = reward;
    }
    entity.SetObjects({ Entity: { Id: guildId, Type: "group" }, Objects: [{ ObjectName: "warPointsPool", DataObject: pool }] });
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

    var getObjectsResult = entity.GetObjects({ Entity: { Id: guildId, Type: "group" } })
    return getObjectsResult.Objects;
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
    titleData = JSON.parse(titleData);
    var allGuilds = titleData.sa.split(","); //All in South America;
    var max = allGuilds.length;
    var chosenGuild = Math.floor(Math.random() * max);
    log.debug("Total guild: " + allGuilds.length);
    log.debug("Chosen guild[" + chosenGuild + "]:", allGuilds[chosenGuild]);

    entity.AddMembers({ Group: { Id: allGuilds[chosenGuild], Type: "group" }, Members: [myEntity], RoleId: "members" });
}