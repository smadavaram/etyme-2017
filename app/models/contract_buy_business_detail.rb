# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_buy_business_details
#
#  id                 :bigint           not null, primary key
#  buy_contract_id    :bigint
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  company_contact_id :integer
#
class ContractBuyBusinessDetail < ApplicationRecord
  belongs_to :buy_contract, optional: true
  belongs_to :company_contact, optional: true
end
