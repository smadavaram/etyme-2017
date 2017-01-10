class AddCompanyIdToAttachments < ActiveRecord::Migration
  def change
    add_column :attachments, :company_id, :integer , index: true , foreign_key: true
  end
end
