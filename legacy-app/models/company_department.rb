# frozen_string_literal: true

# == Schema Information
#
# Table name: company_departments
#
#  id            :bigint           not null, primary key
#  company_id    :bigint
#  department_id :bigint
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#
class CompanyDepartment < ActiveRecord::Base
  belongs_to  :company
  belongs_to  :department

  accepts_nested_attributes_for :department, allow_destroy: true, reject_if: :all_blank
end
