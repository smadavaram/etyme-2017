class AddStatusesToJob < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :jobs, :status, :string
  end
end
