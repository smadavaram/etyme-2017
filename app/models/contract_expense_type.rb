# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_expense_types
#
#  id         :bigint           not null, primary key
#  name       :string
#  status     :integer
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class ContractExpenseType < ApplicationRecord
end
