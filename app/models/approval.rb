class Approval < ApplicationRecord
  enum approvable_type: [:timesheet, :invoice, :expense, :timesheet_approve, :slaray_calculation, :slaray_process]
  belongs_to :user
  belongs_to :contractable, polymorphic: true
  belongs_to :company
end