# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_salary_histories
#
#  id           :bigint           not null, primary key
#  contract_id  :bigint
#  company_id   :bigint
#  candidate_id :bigint
#  amount       :decimal(, )
#  final_amount :decimal(, )
#  description  :text
#  salary_type  :string
#  salable_type :string
#  salable_id   :bigint
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class ContractSalaryHistory < ApplicationRecord
  belongs_to :contract
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true

  belongs_to :salable, polymorphic: :true
end
