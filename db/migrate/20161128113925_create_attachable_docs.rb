class CreateAttachableDocs < ActiveRecord::Migration[4.2]
  def change
    create_table :attachable_docs do |t|
      t.integer     :company_doc_id , index: true , foreign_key: true
      t.string      :orignal_file
      t.references  :documentable, polymorphic: true, index: true

      t.timestamps null: false
    end
  end
end
