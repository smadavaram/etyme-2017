class CscAccount < ApplicationRecord
  belongs_to :contract_sale_commision, optional: true
  belongs_to :accountable, polymorphic: true, optional: true
  belongs_to :contract, optional: true

  after_create :update_contract_id


  def update_contract_id
    self.contract_id = self.contract_sale_commision.buy_contract.contract_id
    self.save
  end
end
