class CreateBlackListers < ActiveRecord::Migration[5.1]
  def change
    create_table :black_listers do |t|
      t.bigint :company_id
      t.integer :status, default: 0
      t.references :blacklister, polymorphic: true
      t.timestamps
    end
  end
end
