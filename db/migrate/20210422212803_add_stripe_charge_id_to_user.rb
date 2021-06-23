class AddStripeChargeIdToUser < ActiveRecord::Migration[5.1]
  def change
    add_column :users, :stripe_charge_id, :integer
    add_column :users, :paid, :boolean
  end
end
