# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_sell_business_details
#
#  id               :bigint           not null, primary key
#  sell_contract_id :bigint
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  user_id          :integer
#  role             :integer          default("member")
#
class ContractSellBusinessDetail < ApplicationRecord
  enum role: %i[member admin]
  belongs_to :sell_contract, optional: true
  belongs_to :company_contact, optional: true
  belongs_to :user
  before_save :enforce_admin
  def enforce_admin
    self.role = :admin if sell_contract.count_contract_bussiness_details == 0
  end
end
