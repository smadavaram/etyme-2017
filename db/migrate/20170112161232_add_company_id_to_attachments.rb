class AddCompanyIdToAttachments < ActiveRecord::Migration[4.2]
  def change
    # remove_column :attachments, :company_id, :integer
    add_column :attachments, :company_id, :integer , index: true , foreign_key: true
  end

end
