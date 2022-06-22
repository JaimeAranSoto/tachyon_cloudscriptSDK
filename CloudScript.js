getPlayerStatisticByName = function (statName) {
    let result = server.GetPlayerStatistics({ PlayFabId: currentPlayerId, StatisticNames: statName });
    log.info(result.Statistics);
    let statistic = result.Statistics[0];
    return statistic.Value;
}

handlers.GainXP = function (args) {

    var xpGained = args.XP; //this could be changed so somehow PlayFab asks for the enemy's xp drop.
    var newXP = getPlayerStatisticByName("XP") + xpGained;

    //Prevent cheating here... !!

    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
            StatisticName: "XP",
            Value: newXP
        }]
    };
    var result = server.UpdatePlayerStatistics(request);
    return newXP;
}

getTimeToUpgradeWeapon = function (formula, currentLevel) {
    // switch(formula)
    // {

    // }
    return Math.pow(currentLevel + 1, 3) - Math.pow(currentLevel, 3);
}

handlers.UgradeWeapon = function (args) {

    var weaponInstanceId = args.weaponInstanceId;
    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId });

    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].InstanceId == weaponInstanceId) {
            inventory[i].CustomData["UpgradeTime"] = Date.now();
        }
    }
}