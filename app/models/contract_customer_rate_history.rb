# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_customer_rate_histories
#
#  id               :bigint           not null, primary key
#  sell_contract_id :bigint
#  customer_rate    :decimal(, )
#  change_date      :date
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#
class ContractCustomerRateHistory < ApplicationRecord
  belongs_to :sell_contract, optional: true
end
