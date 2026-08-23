// Holder emails, French first then English in the same message. Sober
// register, product lexicon only: no financial vocabulary, no promised
// amounts, no guaranteed timing.

export interface Message {
  subject: string;
  text: string;
}

const SEPARATOR = '\n\n----\n\n';

export const claimReceived: Message = {
  subject: 'Votre demande de livraison est enregistrée / Your delivery request has been received',
  text:
    `Bonjour,

Nous avons bien reçu votre demande de livraison. Elle est inscrite sur le registre Stellar et transmise à nos équipes, qui préparent vos bouteilles avec le château.

Vous pouvez suivre son avancement à tout moment depuis Ma cave.

L'équipe TERWA` +
    SEPARATOR +
    `Hello,

We have received your delivery request. It is recorded on the Stellar ledger and passed on to our team, who are preparing your bottles with the estate.

You can follow its progress at any time from My cellar.

The TERWA team`,
};

export const claimFulfilled: Message = {
  subject: 'Votre livraison est effectuée / Your delivery is complete',
  text:
    `Bonjour,

Votre livraison est effectuée. Vos bouteilles ont quitté l'entrepôt et la remise est confirmée sur le registre Stellar.

Nous vous souhaitons une très belle dégustation.

L'équipe TERWA` +
    SEPARATOR +
    `Hello,

Your delivery is complete. Your bottles have left the warehouse and the handover is confirmed on the Stellar ledger.

We wish you a wonderful tasting.

The TERWA team`,
};

export const repurchaseSettled: Message = {
  subject: 'Votre reprise producteur est réglée / Your producer repurchase has been settled',
  text:
    `Bonjour,

Votre demande de reprise producteur est réglée. Le règlement est inscrit sur le registre Stellar et les fonds correspondants ont été transférés vers votre adresse Stellar.

Vous pouvez retrouver le détail de l'opération depuis Ma cave.

L'équipe TERWA` +
    SEPARATOR +
    `Hello,

Your producer repurchase request has been settled. The settlement is recorded on the Stellar ledger and the corresponding funds have been transferred to your Stellar address.

You can find the details of the operation in My cellar.

The TERWA team`,
};
