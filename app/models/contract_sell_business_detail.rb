class ContractSellBusinessDetail < ApplicationRecord
	enum role: [:member, :admin]
	belongs_to :sell_contract, optional: true
	belongs_to :company_contact, optional: true
	before_save :enforce_admin



  
    def enforce_admin
      self.role = :admin  if self.sell_contract.count_contract_bussiness_details == 0 
    end
end
