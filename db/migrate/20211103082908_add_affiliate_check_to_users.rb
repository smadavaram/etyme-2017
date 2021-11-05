class AddAffiliateCheckToUsers < ActiveRecord::Migration[5.2]
  def change
    add_column :users, :affiliate_check, :boolean , default: false
  end
end
