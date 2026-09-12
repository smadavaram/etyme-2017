# frozen_string_literal: true

# == Schema Information
#
# Table name: approvals
#
#  id                :bigint           not null, primary key
#  user_id           :bigint
#  contractable_type :string
#  contractable_id   :bigint
#  approvable_type   :integer
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  company_id        :bigint
#
class Approval < ApplicationRecord
  enum approvable_type: %i[timesheet invoice expense timesheet_approve slaray_calculation slaray_process expanse_invoice expanse_approve]
  belongs_to :user
  belongs_to :contractable, polymorphic: true
  belongs_to :company
end
