class AddCommisionToContract < ActiveRecord::Migration
  def change
    add_column :contracts, :is_commission, :boolean , default: false
    add_column :contracts, :commission_type, :integer , default: 0
    add_column :contracts, :commission_amount, :float , default: 0.0
    add_column :contracts, :max_commission, :float
    add_column :contracts, :commission_for_id, :integer
    add_column :invoices, :total_amount, :decimal , default: 0.0
    add_column :invoices, :commission_amount, :decimal , default: 0.0
    add_column :invoices, :billing_amount, :decimal , default: 0.0
  end
end
