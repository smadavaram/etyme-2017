class AddCompanyIdToApprovals < ActiveRecord::Migration[5.1]
  def change
    add_column :approvals, :company_id, :bigint
  end
end
