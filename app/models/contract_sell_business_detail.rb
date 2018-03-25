class ContractSellBusinessDetail < ApplicationRecord
  belongs_to :sell_contract, optional: true
  belongs_to :company_contact, optional: true
end
