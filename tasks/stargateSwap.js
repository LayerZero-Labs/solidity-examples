const CHAIN_ID = require("../constants/chainIds.json")
const { getDeploymentAddresses } = require("../utils/readStatic")

module.exports = async function (taskArgs, hre) {
    console.log(taskArgs)

    let signers = await ethers.getSigners()
    let owner = signers[0]
    let tx

    const erc20 = await ethers.getContractAt("ERC20", taskArgs.bridgeToken)
    console.log(`erc20.address: ${erc20.address}`)
    const qty = taskArgs.qty
    const dstChainId = CHAIN_ID[taskArgs.targetNetwork]
    const dstStargateSwapAddr = getDeploymentAddresses(taskArgs.targetNetwork)["StargateSwap"]
    // get source contract instance
    const stargateSwap = await ethers.getContract("StargateSwap")
    console.log(`[source] address: ${stargateSwap.address}`)

    tx = await (await erc20.approve(stargateSwap.address, qty)).wait()
    console.log(`approve tx: ${tx.transactionHash}`)

    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 10000

    tx = await( await stargateSwap.swap(
        qty,
        taskArgs.bridgeToken,
        dstChainId,
        taskArgs.srcPoolId,
        taskArgs.dstPoolId,
        owner.address,          // to address on destination
        deadline,
        dstStargateSwapAddr,
        {value: ethers.utils.parseEther("4")}
    )).wait()
    console.log(`tx: ${tx.transactionHash}`)
}