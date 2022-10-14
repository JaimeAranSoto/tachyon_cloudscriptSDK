////////////// BLOCKCHAIN

handlers.PurchaseItem = function (args) {
    var purchases = args.purchases;
    /* EXAMPLE:
    "purchases": [
        {
            "purchaseId": 1,
            "tokenAmount": 247.00000000,
            "gemAmount": 80.00000000,
            "packId": 1,
            "type": "ON_CHAIN",
            "transactionHash": "0x8e34e52401b29cf09da424429591ae3321d3cb54ade858e80b992f447fac684e"
        },
        {
            "purchaseId": 2,
            "tokenAmount": 247.00000000,
            "gemAmount": 80.00000000,
            "packId": 1,
            "type": "ON_CHAIN",
            "transactionHash": "0x8e34e52401b29cf09da424429591ae3321d3cb54ade858e80b992f447fac684e"
        }
    ]
    */

    var response = [];

    purchasesLoop: for (let i = 0; i < purchases.length; i++) {
        const purchase = purchases[i];
        var internalData = server.GetUserInternalData({ PlayFabId: purchase.PlayFabId, Keys: ["purchases"] });

        if (internalData.Data.purchases != null) {
            var internalData = JSON.parse(internalData.Data.purchases.Value);
        } else {
            var internalData = [];
        }
        var newPurchaseId = purchase.purchaseId;

        for (let j = 0; j < internalData.length; j++) {
            const storedPurchase = internalData[j];
            if (storedPurchase.purchaseId == newPurchaseId) {
                response.push({ purchaseId: newPurchaseId, status: "already_confirmed" });
                continue purchasesLoop;
            }
        }

        var tokenAmount = purchase.tokenAmount;
        var gemAmount = purchase.gemAmount;
        var packId = purchase.packId;
        var type = purchase.type;
        var transactionHash = purchase.transactionHash;
        response.push({ purchaseId: newPurchaseId, status: "confirmed" });

        internalData.push(purchase);

        server.UpdateUserInternalData({
            PlayFabId: purchase.PlayFabId, Data: {
                "purchases": JSON.stringify(internalData)
            }
        })
    }

    return response;
}

handlers.ConfirmPurchase = function (args) {
    var purchaseId = args.purchaseId;

    var internalData = server.GetUserInternalData({ PlayFabId: currentPlayerId, Keys: ["purchases", "confirmedPurchases"] }).Data;

    if (internalData.purchases == null) {
        log.debug("Player has no purchases");
        return "Player has no purchases";
    }
    if (internalData.confirmedPurchases != null) {
        var data = JSON.parse(internalData.confirmedPurchases.Value);
        for (let i = 0; i < data.length; i++) {
            const confirmedPurchase = data[i];
            if (confirmedPurchase.purchaseId == purchaseId) {
                return "Player already confirmed this purchase";
            }

        }
    }

    purchasesData = JSON.parse(internalData.purchases.Value);

    for (let i = 0; i < purchasesData.length; i++) {
        const storedPurchase = purchasesData[i];
        if (storedPurchase.purchaseId == purchaseId) {
            //--Buy item or do whatever is needed to do--//
            server.UpdateUserInternalData({
                PlayFabId: currentPlayerId, Data: {
                    "confirmedPurchases": JSON.stringify([storedPurchase])
                }
            })

            log.debug("Purchase confirmed");
            return "Purchase confirmed!";
        }
    }

    log.debug("Player doesn't have this purchase");
    return "Player doesn't have this purchase";
}

handlers.CheckPendingPurchases = function (args) {
    var internalData = server.GetUserInternalData({ PlayFabId: currentPlayerId, Keys: ["purchases", "confirmedPurchases"] }).Data;

    if (internalData.purchases == null) {
        log.debug("Player has no purchases");
        return 0;
    }

    var purchasesData = JSON.parse(internalData.purchases.Value);
    var confirmedPurchasesData = JSON.parse(internalData.confirmedPurchases.Value);

    var pendingPurchases = [];
    var purchaseValue = 0;

    for (let i = 0; i < purchasesData.length; i++) {
        const purchase = purchasesData[i];
        for (let j = 0; j < confirmedPurchasesData.length; j++) {
            const confirmedPurchase = confirmedPurchasesData[j];
            if (purchase.purchaseId != confirmedPurchase.purchaseId) {
                pendingPurchases.push(purchase);
                purchaseValue += purchase.gemAmount;
            }
        }
    }

    for (let i = 0; i < pendingPurchases.length; i++) {
        const pendingPurchase = pendingPurchases[i];
        var result = handlers.ConfirmPurchase({ purchaseId: pendingPurchase.purchaseId });
        log.debug("Pending purchase id: " + pendingPurchase.purchaseId + " - " + result);
    }

    return purchaseValue;
}