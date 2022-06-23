GetPlayerStatisticByName = function (statName) {
    let result = server.GetPlayerStatistics({ PlayFabId: currentPlayerId, StatisticNames: statName });
    log.info(result.Statistics);
    let statistic = result.Statistics[0];
    return statistic.Value;
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

GetTimeToUpgradeWeapon = function (formula, currentLevel) {
    return (Math.pow(currentLevel + 1, 3) - Math.pow(currentLevel, 3)) * 1000; //assuming (level+1)^3 - level^3 formula
}

UpgradeWeapon = function (weaponInstanceId, currentPlayerId) {

    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory;
    var weaponLevel;

    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].ItemInstanceId == weaponInstanceId) {
            weaponLevel = inventory[i].CustomData["Level"];
        }
    }

    if (weaponLevel == null) {
        weaponLevel = 1;
    }
    weaponLevel++;
    server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { Level: weaponLevel } });
}

function GetWeapon(ItemInstanceId) {
    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory;
    var weapon = undefined;

    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].ItemInstanceId == ItemInstanceId) {
            weapon = inventory[i];
        }
    }
    return weapon;
}

handlers.UpdateWeaponUpgrade = function (args) {
    //Consider that players could pay to directly upgrade the weapons without needing to wait.

    //Prevent cheating...

    var weaponInstanceId = args.weaponInstanceId;
    var weapon = GetWeapon(weaponInstanceId);

    if (weapon === undefined || weapon == null) {
        log.debug("Weapon is not in player's inventory");
        return;
    }

    log.debug("Custom Data?", weapon.CustomData);
    if (weapon.CustomData === undefined) {
        server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { Level: 1 } });
    }
    if (weapon.CustomData.UpgradeTimeStamp != undefined) {
        var weaponUpgradeTimestamp = weapon.CustomData.UpgradeTimeStamp;
    } else {
        var weaponUpgradeTimestamp = Date.now();
    }

    if (Date.now() - weaponUpgradeTimestamp >= GetTimeToUpgradeWeapon(null, weapon.CustomData.Level)) {
        UpgradeWeapon(weaponInstanceId, currentPlayerId);
    }

    server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { UpgradeTimeStamp: Date.now() } });
}

