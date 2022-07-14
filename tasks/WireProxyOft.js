const CHAIN_ID = require("../constants/chainIds.json")
const { getDeploymentAddresses } = require("../utils/readStatic")

module.exports = async function (taskArgs, hre) {
    const networks = ["fuji", "rinkeby", "bsc-testnet", "mumbai", "arbitrum-rinkeby", "optimism-kovan", "fantom-testnet"]
    const dstNetworks = networks.filter(net => net !== hre.network.name)

    for (const dstNet of dstNetworks) {
        const dstChainId = CHAIN_ID[dstNet]
        const dstAddr = getDeploymentAddresses(dstNet)[dstNet === "fuji" ? "ProxyOFT" : "OFT"]

        const contractInstance = await ethers.getContract(hre.network.name === "fuji" ? "ProxyOFT" : "OFT")
        console.log(`[source] Proxy contract address: ${contractInstance.address}`)
        console.log("dstNetwork: ", dstNet, "wiring: dstChainId", dstChainId, " -> dstAddress: ", dstAddr)

        // setTrustedRemote() on the local contract, so it can receive message from the source contract
        try {
            if (!(await contractInstance.isTrustedRemote(dstChainId, dstAddr))){
                let tx = await (await contractInstance.setTrustedRemote(dstChainId, dstAddr)).wait()
                console.log(`✅ [${hre.network.name}] setTrustedRemote(${dstChainId}, ${dstAddr})`)
                console.log(` tx: ${tx.transactionHash}`)
            } else {
                console.log("*source already set*")
            }
        } catch (e) {
            if (e.error.message.includes("The chainId + address is already trusted")) {
                console.log("*source already set*")
            } else {
                console.log(e)
            }
        }
    }

}
