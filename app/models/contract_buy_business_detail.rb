class ContractBuyBusinessDetail < ApplicationRecord
  belongs_to :buy_contract, optional: true
  belongs_to :company_contact, optional: true
end
