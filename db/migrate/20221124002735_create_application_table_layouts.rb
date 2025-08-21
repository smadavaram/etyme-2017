class CreateApplicationTableLayouts < ActiveRecord::Migration[5.2]
  def change
    create_table :application_table_layouts do |t|
      t.text :bench_columns
      t.text :columns
      t.references :user
      t.timestamps
    end
  end
end
