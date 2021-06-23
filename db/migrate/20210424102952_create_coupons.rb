class CreateCoupons < ActiveRecord::Migration[5.1]
  def change
    create_table :coupons do |t|
      t.string :name
      t.datetime :validated_till
      t.integer :used_times

      t.timestamps
    end
  end
end
