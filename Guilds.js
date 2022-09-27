/*handlers.VoteForGuildWar = function (args, context) {
    // -2 = Player has already voted (allow to change opinion?? To be discussed...)
    // -1 = Guild (mine or targeted) doesn't exist

    var myEntityId = args.myEntityId;
    var approve = args.approve; //bool
    var targetedGuildId = args.targetedGuildId;
    var allMyGuilds = entity.ListMembership({ Entity: { Id: myEntityId, Type: "title_player_account" } });
    var myGuild = allMyGuilds.Groups[0];

    if (myGuild == null || myGuild === undefined) {
        log.debug("Current player is not in a guild", allMyGuilds);
        return -1;
    } else {
        log.debug("Guild found", myGuild);
    }

    var getObjectsResult = entity.GetObjects({ Entity: myGuild.Group });

    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("PlayerGuild has no objects");
        return -1;
    }

    var myGuildObjects = getObjectsResult.Objects;

    if (myGuildObjects.Votings === undefined) {
        myGuildObjects.Votings = { ObjectName: "Votings", DataObject: {} };
    }
    var votings = myGuildObjects.Votings.DataObject;

    var approveVotes = [];
    var denyVotes = [];
    if (approve) {
        approveVotes.push(myEntityId);
    } else {
        denyVotes.push(myEntityId);
    }

    for (let i = 0; i < votings.length; i++) {
        var voting = votings[i];
        if (voting.enemyGuild == targetedGuildId) {
            for (let j = 0; j < voting.approveVotes.length; j++) {
                var vote = voting.approveVotes[j];
                approveVotes.push(vote);
                if (vote == myEntityId) {
                    return -2;
                }
            }
            for (let j = 0; j < voting.denyVotes.length; j++) {
                var vote = voting.denyVotes[j];
                denyVotes.push(vote);
                if (vote == myEntityId) {
                    return -2;
                }
            }
        }
    }

    var newVoting = { approveVotes: approveVotes, denyVotes: denyVotes, enemyGuild: targetedGuildId };
    log.debug("New Singular Voting", newVoting);

    if (votings == null || votings === undefined || votings.length == 0) {
        votings = [];
        votings[0] = newVoting;
    } else {
        for (let i = 0; i < votings.length; i++) {
            if (votings[i].enemyGuild == targetedGuildId) {
                votings[i] = newVoting; //Replace old voting
                log.debug("Previous voting replaced");
                break;
            }
            if (i == votings.length - 1) {
                votings.push(newVoting);
                break;
            }
        }
    }
    log.debug("New Votings", votings);
    entity.SetObjects({ Entity: { Id: myGuild.Group.Id, Type: "group" }, Objects: [{ ObjectName: "Votings", DataObject: votings }] });
    // entity.SetObjects({ Entity: { Id: myGuild.Group.Id, Type: "group" }, Objects: myGuildObjects });
    return 1;
}*/


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
                    //TODO: Create battle defense in defender guild.
                    var defense = { date: Date.now(), participants: [], attackerGuildId: attackerGuildId };
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

    var myGuildObjects = GetMyGuildObjects(myEntityId);

    var isNewInvitation = false;
    if (myGuildObjects.battleInvitation === undefined) { //If it doesn't exist
        isNewInvitation = true;
        log.debug("A new Battle Invitation was created.")
        myGuildObjects.battleInvitation = { ObjectName: "battleInvitation", DataObject: {} };
    } else {
        if (handlers.CheckExpirationForBattleInvitation({ attackerGuildId: myGuild.Group.Id })) { //If has just expired
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

    entity.SetObjects({ Entity: { Id: myGuild.Group.Id, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitation }] });
    return 1;
}

handlers.DefendGuild = function (args) {
    var myEntityId = args.myEntityId;
    var myGuildObjects = GetMyGuildObjects(myEntityId);

    if (myGuildObjects.battleDefense == null) return -1;
    var defense = myGuildObjects.battleDefense.DataObject;

    if (defense.participants.includes(myEntityId)) return -2; //already entered

    defense.participants.push(myEntityId);
    entity.SetObjects({ Entity: { Id: GetMyGuild(myEntityId), Type: "group" }, Objects: [{ ObjectName: "battleDefense", DataObject: defense }] });
    return 1;
}

handlers.FinishWar = function (args) {
    var myEntityId = args.myEntityId;
    var won = args.won; //bool

    var myGuildObjects = GetMyGuildObjects(myEntityId);

    if (myGuildObjects.battleInvitation != null) {
        var invitation = myGuildObjects.battleInvitation.DataObject;
        if (invitation.participants.includes(myEntityId) || invitation.leader == myEntityId) {
            //TODO: Give prizes
            { }
            invitation.leader = "";
            invitation.participants = [];
            invitation.successful = false;
            entity.SetObjects({ Entity: { Id: myGuild.Group.Id, Type: "group" }, Objects: [{ ObjectName: "battleInvitation", DataObject: invitation }] });
            return 1; //War finished successfully, battleInvitation was reset.
        } else {
            return -3; //Player is not a participant or method was already called by another player.
        }
    } else {
        return -2; //Guild has no active invitation
    }
}

GetMyGuildObjects = function (playerId) {
    var myGuild = GetMyGuild(playerId);

    if (myGuild == null) return null;

    var getObjectsResult = entity.GetObjects({ Entity: myGuild.Group });

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
    return myGuild;
}

/*
handlers.VoteForGuildWar = function (args, context) {
    var myEntityId = args.myEntityId;
    var vote = args.vote; //bool
    var targetedGuildId = args.targetedGuildId; //this could be null
    var date = args.date;
 
    var allMyGuilds = entity.ListMembership({ Entity: { Id: myEntityId, Type: "title_player_account" } });
    var myGuild = allMyGuilds.Groups[0];
 
    if (myGuild == null || myGuild === undefined) {
        log.debug("Current player is not in a guild", allMyGuilds);
        return -1;
    } else {
        log.debug("Guild found", myGuild);
    }
 
    var getObjectsResult = entity.GetObjects({ Entity: myGuild.Group });
 
    if (getObjectsResult == null || getObjectsResult === undefined) {
        log.debug("PlayerGuild has no objects");
        return -1;
    }
 
    var myGuildObjects = getObjectsResult.Objects;
 
    var isNewAttack = false;
 
    if (myGuildObjects.guildAttack === undefined) {
        myGuildObjects.guildAttack = { ObjectName: "guildAttack", DataObject: {} };
        isNewAttack = true;
    }
    var votings = myGuildObjects.guildAttack.DataObject;
    votings.guildId = targetedGuildId;
    //if (isNewAttack) { //This will be reactivated again
    votings.responsible = myEntityId;
    votings.date = date;
    //}
 
    if (votings.yes == null) votings.yes = [];
    if (votings.no == null) votings.no = [];
 
    if (vote && !votings.yes.includes(myEntityId)) {
        votings.yes.push(myEntityId);
    } else if (!votings.no.includes(myEntityId)) {
        votings.no.push(myEntityId);
    }
 
    entity.SetObjects({ Entity: { Id: myGuild.Group.Id, Type: "group" }, Objects: [{ ObjectName: "guildAttack", DataObject: votings }] });
    return 1;
}
*/

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