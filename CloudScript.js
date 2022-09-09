var entity = PlayFab.DataApi;
var server = PlayFab.ServerApi;

handlers.AddCurrency = function (args) {
    var amount = args.Amount;
    var currency = server.GetUserInventory({ PlayFabId: currentPlayerId }).VirtualCurrency[args.CurrencyAbrev];

    // Check here if this is a valid request. In other words, if player IS NOT CHEATING

    var request = {
        Amount: amount,
        PlayFabId: currentPlayerId,
        VirtualCurrency: args.CurrencyAbrev
    };

    var result = server.AddUserVirtualCurrency(request);
    return currency + amount;
}

GetPlayerStatisticByName = function (statName) {
    let result = server.GetPlayerStatistics({ PlayFabId: currentPlayerId, StatisticNames: statName });
    log.info(result.Statistics);
    let statistic = result.Statistics[0];
    return statistic.Value;     // Consider to have different return values depending on transaction success state
}

handlers.GainXP = function (args) {

    var xpGained = args.XP; //this could be changed so somehow PlayFab asks for the enemy's xp drop.
    var newXP = GetPlayerStatisticByName("XP") + xpGained;

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

