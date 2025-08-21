# frozen_string_literal: true

# == Schema Information
#
# Table name: commission_queues
#
#  id                         :bigint           not null, primary key
#  contract_sale_commision_id :bigint
#  status                     :integer
#  buy_contract_id            :bigint
#  salary_id                  :bigint
#  total_amount               :decimal(, )
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#
class CommissionQueue < ApplicationRecord
  belongs_to :contract_sale_commision
  belongs_to :buy_contract
  belongs_to :salary

  enum status: %i[pending salaried]
end
