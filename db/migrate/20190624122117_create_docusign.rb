class CreateDocusign < ActiveRecord::Migration[5.1]
  def change
    create_table :docusigns do |t|
      t.string :ds_expires_at
      t.string :ds_user_name
      t.string :ds_access_token
      t.string :ds_refresh_token
      t.string :ds_account_id
      t.string :ds_account_name
      t.string :ds_base_path
      t.integer :company_id
    end
  end
end
