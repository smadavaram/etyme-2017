class AddOmniauthToCandidatesAndUsers < ActiveRecord::Migration[5.2]
  def change
    add_column :candidates, :provider, :string
    add_column :candidates, :uid, :string

    add_column :users, :provider, :string
    add_column :users, :uid, :string
  end
end
