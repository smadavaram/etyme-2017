class ContractCycle < ApplicationRecord
  CYCLETYPES = [ "TimesheetSubmit", "TimesheetApprove" ]

  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true
  belongs_to :cyclable, polymorphic: true, optional: true

  validates :cycle_type, uniqueness: { scope: [ :cyclable_type, :cyclable_id ] }, if: Proc.new { |cc| cc.cyclable_type.present? }
  validates :cycle_type,
            presence: true,
            inclusion: { in: CYCLETYPES }

end
