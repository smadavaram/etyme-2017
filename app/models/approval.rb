class Approval < ApplicationRecord
  enum approvable_type: [:timesheet, :invoice, :expense]
  belongs_to :user
  belongs_to :contractable, polymorphic: true
end