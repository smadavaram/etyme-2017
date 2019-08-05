class Approval < ApplicationRecord
  enum approvable_type: [:timesheet, :invoice, :expense, :timesheet_approve]
  belongs_to :user
  belongs_to :contractable, polymorphic: true
end