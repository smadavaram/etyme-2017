class CreateBillingInfos < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :billing_infos do |t|
      t.belongs_to :company, index: true
      t.string :address
      t.string :city
      t.string :country
      t.string :zip
      t.timestamps null: false
    end
  end
end