handlers.VoteForGuildWar = function (args, context) {
    // -2 = Player has already voted (allow to change opinion??)
    // -1 = Guild (mine or targeted) doesn't exist

    var myEntityId = args.myEntityId;
    var approve = args.approve; //bool
    var targetedGuildId = args.targetedGuildId;

    var myGuilds = entity.ListMembership({ Entity: { Id: myEntityId, Type: "title_player_account" } });
    var myGuild = myGuilds.Groups[0];

    if (myGuild == null || myGuild === undefined) {
        log.debug("Current player is not in a guild", myGuilds);
        return -1;
    } else {
        log.debug("Guild found", myGuild);
    }

    var myGuildObjects = entity.GetObjects({ Entity: myGuild.Group });

    if (myGuildObjects == null || myGuildObjects === undefined) {
        log.debug("PlayerGuild has no objects");
        return -1;
    }

    var myGuildObjectResult = myGuildObjects.Objects;
    var votings = myGuildObjectResult.Votings;

    log.debug("Previous Votings", votings);

    var approveVotes = [];
    var denyVotes = [];
    if (approve) {
        approveVotes.push(currentPlayerId);
    } else {
        denyVotes.push(currentPlayerId);
    }

    for (let i = 0; i < votings.length; i++) {
        var voting = votings[i];
        log.debug("Voting found", voting);
        if (voting.enemyGuildId == targetedGuildId) {

            voting.approveVotes.forEach(vote => {
                if (vote == currentPlayerId) {
                    return -2;
                }
            });
            voting.denyVotes.forEach(vote => {
                if (vote == currentPlayerId) {
                    return -2;
                }
            });

            approveVotes.concat(voting.approveVotes);
            denyVotes.concat(voting.denyVotes);
        }

    }
    var newVoting = { approveVotes: approveVotes, denyVotes: denyVotes, enemyGuildId: targetedGuildId };
    log.debug("New Singular Voting", newVoting);

    if (voting == null || voting === undefined || voting.length == 0) {
        votings.push(newVoting);
    } else {
        for (let i = 0; i < votings.length; i++) {
            if (votings[i].enemyGuildId == targetedGuildId) {
                votings[i] = newVoting; //Replace old voting
                break;
            }
            if (i = votings.length - 1) {
                votings.push(newVoting);
                break;
            }
        }
    }
    log.debug("New Votings", votings);

    entity.SetObjects({ Entity: myGuild.Group, Objects: myGuildObjectResult });
    return 1;
}