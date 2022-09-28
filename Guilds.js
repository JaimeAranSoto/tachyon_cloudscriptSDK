handlers.CheckExpirationForBattleInvitation = function (args) {
    const EXPIRATION_TIME = 3 * 60; //Seconds
    const BATTLE_MAX_DURATION = 5 * 60;

    var attackerGuildId = args.attackerGuildId;
    var groupObjectData = entity.GetObjects({
        Entity: { Id: attackerGuildId, Type: "group" }
    });

    var expired = 0;

    var myGuildObjects = groupObjectData.Objects;
    if (myGuildObjects.battleInvitation !== undefined) {
        var invitation = myGuildObjects.battleInvitation.DataObject;
        if (invitation == "") {
            log.debug("The BatlleInvitation expired previously.")
            expired = true;
        }
        var timeSinceCreated = (Date.now() - Date.parse(invitation.date)) / 1000;
        if (timeSinceCreated >= EXPIRATION_TIME) {
            log.debug("The BatlleInvitation is expired.")

            if (invitation.participants.length >= 4) {
                log.debug("The battle invitation was successful and a GuildWar started.");
                var battleDuration = timeSinceCreated - EXPIRATION_TIME;
                log.debug("Battle duration: " + battleDuration);
                if (battleDuration >= BATTLE_MAX_DURATION) {
                    invitation.successful = false;
                    invitation.participants = [];
                    invitation.leader = "";
                } else {
                    invitation.successful = true;
                    //Create battle defense in defender guild.
                    var defense = { date: new Date().getUTCDate(), participants: [], attackerGuildId: attackerGuildId };
                    entity.SetObjects({ Entity: { Id: invitation.guildId, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });
                }
                entity.SetObjects({ Entity: { Id: attackerGuildId, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitation }] });
            }

            expired = true;
        } else {
            expired = false;
            log.debug("The BatlleInvitation has not expired yet.")
            expired = 0;
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
    invitation.successful = invitation.participants.length >= 4;

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

handlers.FinishWar = function (args) {
    var myEntityId = args.myEntityId;
    var didAttackersWon = args.won; //bool

    var myGuild = GetMyGuild(myEntityId);
    var myGuildObjects = GetMyGuildObjects(myEntityId);

    var attackerGuild = myGuild.Id;
    var defenderGuild = myGuildObjects.battleInvitation.DataObject.guildId;

    if (myGuildObjects.battleInvitation != null) {
        var invitation = myGuildObjects.battleInvitation.DataObject;
        if (invitation.participants.includes(myEntityId) || invitation.leader == myEntityId) {
            SplitWarPoints(attackerGuild, didAttackersWon, false);
            SplitWarPoints(defenderGuild, !didAttackersWon, true);

            var newInvitation = { leader: "", participants: [], successful: false };
            entity.SetObjects({ Entity: { Id: attackerGuild, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: newInvitation }] });

            var newDefense = { date: new Date().getUTCDate(), participants: [], attackerGuildId: attackerGuildId };
            entity.SetObjects({ Entity: { Id: defenderGuild, Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: newDefense }] });
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

    var pool = objects.warPointsPool;
    if (pool == null) return;
    var poolData = pool.DataObject;
    if (poolData == null) return;
    var participants = poolData.pool;
    if (participants == null) return;

    if (participants[playerEntityId] != null) {
        server.UpdatePlayerStatistics({ PlayFabId: currentPlayerId, Statistics: [{ StatisticName: "WAR_POINTS", Value: participants[playerEntityId] }] });
        delete participants[playerEntityId];

        entity.SetObjects({ Entity: { Id: GetMyGuild().Id, Type: "group" }, Objects: [{ ObjectName: "warPointsPool", DataObject: participants }] });
    }else{
        log.debug("Player is not eligible for war points.")
    }

}

SplitWarPoints = function (guildId, won, defending) {
    log.debug("SplitWarPoints called, guild id: " + guildId + " has won?: " + won + " is defending?:" + defending);
    const WINNER_POOL = 8000;
    const LOSER_POOL = 2000;

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
        for (let i = 0; i < division; i++) {
            const player = objects.battleDefense.DataObject.participants[i];
            pool[player] = won ? WINNER_POOL / division : LOSER_POOL / division; //TODO: Check if has NFT and add multiplier system
        }
    } else { //Attacking
        var division = objects.battleInvitation.DataObject.participants.length;
        for (let i = 0; i < division; i++) {
            const player = objects.battleInvitation.DataObject.participants[i];
            pool[player] = won ? WINNER_POOL / division : LOSER_POOL / division; //TODO: Check if has NFT and add multiplier system
        }
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
    var chosenGuild = Math.floor(Math.random(allGuilds.length));
    log.debug("Chosen guild[" + chosenGuild + "]:", allGuilds[chosenGuild]);

    entity.AddMembers({ Group: { Id: allGuilds[chosenGuild], Type: "group" }, Members: [myEntity], RoleId: "members" });
}