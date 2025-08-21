class AddFileFieldToTransactions < ActiveRecord::Migration[4.2]
  def change
    add_column :transactions, :file, :string
  end
end
