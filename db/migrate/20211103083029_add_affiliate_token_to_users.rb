class AddAffiliateTokenToUsers < ActiveRecord::Migration[5.2]
  def change
    add_column :users, :affiliate_token, :string
  end
end
