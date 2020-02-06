# frozen_string_literal: true

class Approval < ApplicationRecord
  enum approvable_type: %i[timesheet invoice expense timesheet_approve slaray_calculation slaray_process expanse_invoice expanse_approve]
  belongs_to :user
  belongs_to :contractable, polymorphic: true
  belongs_to :company
end
