class ContractSellBusinessDetail < ApplicationRecord
	enum role: [:member, :admin]
	belongs_to :sell_contract, optional: true
	belongs_to :company_contact, optional: true
	
	# def self.have_admin(sell_contract_id)
	# 	return ContractSellBusinessDetail.where(sell_contract_id:sell_contract_id).pluck('role').include?('admin')
		
	# end	
end
