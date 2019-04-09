class AddTempPassInUser < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :users, :temp_pass, :string, default: nil
  end
end
