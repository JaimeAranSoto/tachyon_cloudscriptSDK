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

handlers.VoteForGuildWar = function (args, context) {
    var myEntityId = args.myEntityId;
    var vote = args.vote; //bool
    var targetedGuildId = args.targetedGuildId; //this could be null

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
    if (isNewAttack) {
        votings.responsible = myEntityId;
        votings.timestamps = Date.now();
    }

    if (votings.yes == null) votings.yes = [];
    if (votings.no == null) votings.no = [];

    if (vote) {
        votings.yes.push(myEntityId);
    } else {
        votings.no.push(myEntityId);
    }

    entity.SetObjects({ Entity: { Id: myGuild.Group.Id, Type: "group" }, Objects: [{ ObjectName: "guildAttack", DataObject: votings }] });
    return 1;
}


handlers.GetGuildObjects = function (args) {
    var guildId = args.guildId;

    var getObjectsResult = entity.GetObjects({ Entity: { Id: guildId, Type: "group" } })
    return getObjectsResult.Objects;
}