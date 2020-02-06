# frozen_string_literal: true

class CommissionQueue < ApplicationRecord
  belongs_to :contract_sale_commision
  belongs_to :buy_contract
  belongs_to :salary

  enum status: %i[pending salaried]
end
