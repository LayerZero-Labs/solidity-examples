const CHAIN_ID = require("../constants/chainIds.json")
const { getDeploymentAddresses } = require("../utils/readStatic")
const OFT_CONFIG = require("../constants/oftConfig.json")

module.exports = async function (taskArgs, hre) {
    let srcContractName = "ExampleOFT20"
    let dstContractName = srcContractName
    if (taskArgs.targetNetwork === OFT_CONFIG.baseChain) {
        // if its the base chain, we need to grab a different contract
        // Note: its reversed though!
        dstContractName = "ExampleBasedOFT20"
    }
    if (hre.network.name === OFT_CONFIG.baseChain) {
        srcContractName = "ExampleBasedOFT20"

    }

    const dstChainId = CHAIN_ID[taskArgs.targetNetwork]
    // console.log(getDeploymentAddresses(taskArgs.targetNetwork))
    const dstAddr = getDeploymentAddresses(taskArgs.targetNetwork)[dstContractName]
    // get local contract instance
    const contractInstance = await ethers.getContract(srcContractName)
    console.log(`[source] contract address: ${contractInstance.address}`)
    const isTrustedRemoteSet = await contractInstance.isTrustedRemote(dstChainId, dstAddr);
    if(!isTrustedRemoteSet) {
        // setTrustedRemote() on the local contract, so it can receive message from the source contract
        try {
            let tx = await (await contractInstance.setTrustedRemote(dstChainId, dstAddr)).wait()
            console.log(`✅ [${hre.network.name}] setTrustedRemote(${dstChainId}, ${dstAddr})`)
            console.log(` tx: ${tx.transactionHash}`)
        } catch (e) {
            if (e.error.message.includes("The chainId + address is already trusted")) {
                console.log("*source already set*")
            } else {
                console.log(`❌ [${hre.network.name}] setTrustedRemote(${dstChainId}, ${dstAddr})`)
            }
        }
    } else {
        console.log("*source already set*")
    }
}
