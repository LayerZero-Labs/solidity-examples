const { MerkleTree } = require("merkletreejs")

module.exports = async function (taskArgs, hre) {
  const advancedONFT = await ethers.getContract("AdvancedONFT721")
  console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

  const wl = ["0x5509feB29Cf44A32D72aec2Fbad8e8A574347D0e"]
  // Generate Merkle Root and setting up to contract
  const leaves = await Promise.all(
    wl.map(async (account) => {
      return ethers.utils.keccak256(account);
    })
  );
  tree = new MerkleTree(leaves, ethers.utils.keccak256, {
    sortPairs: true,
  });
  const merkleRoot = tree.getHexRoot();

  // added a list of addresses to Wl
  try {
    let tx1 = await (await advancedONFT.setMerkleRoot(merkleRoot)).wait()
    console.log(`✅ [${hre.network.name}] setAllowList(wl)`)
    console.log(` tx1: ${tx1.transactionHash}`)
  } catch (e) {
    console.log(e)
  }
}