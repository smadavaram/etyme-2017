# frozen_string_literal: true

# == Schema Information
#
# Table name: company_employee_docs
#
#  id                    :bigint           not null, primary key
#  company_id            :integer
#  title                 :string
#  file                  :string
#  exp_date              :date
#  is_required_signature :boolean
#  created_by            :integer
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  title_type            :string
#  is_require            :string
#
class CompanyEmployeeDoc < ApplicationRecord
end
