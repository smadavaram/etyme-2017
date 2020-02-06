# frozen_string_literal: true

class ContractCustomerRateHistory < ApplicationRecord
  belongs_to :sell_contract, optional: true
end
