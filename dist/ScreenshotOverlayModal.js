import{jsx as e,jsxs as o}from"react/jsx-runtime";var i=({isOpen:d,imageUrl:r,overlay:t,json:n,onClose:a})=>d?o("div",{className:"screenshot-modal-backdrop",onClick:s=>{s.target===s.currentTarget&&a()},children:[o("div",{className:"screenshot-modal",children:[o("div",{className:"screenshot-modal-header",children:[e("h3",{children:"Screenshot View"}),e("button",{className:"close-btn",onClick:a,children:"\xD7"})]}),o("div",{className:"screenshot-modal-content",children:[r&&o("div",{className:"screenshot-container",children:[e("img",{src:r,alt:"Screenshot",className:"screenshot-image",style:{maxWidth:"100%",maxHeight:"70vh",objectFit:"contain"}}),t&&e("div",{className:"screenshot-overlay",children:e("pre",{children:JSON.stringify(t,null,2)})})]}),n&&o("div",{className:"screenshot-json",children:[e("h4",{children:"Associated Data:"}),e("pre",{children:JSON.stringify(n,null,2)})]})]})]}),e("style",{jsx:!0,children:`
        .screenshot-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .screenshot-modal {
          background: white;
          border-radius: 8px;
          max-width: 90vw;
          max-height: 90vh;
          overflow: auto;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .screenshot-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .screenshot-modal-header h3 {
          margin: 0;
          color: #333;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .close-btn:hover {
          color: #000;
        }
        
        .screenshot-modal-content {
          padding: 1rem;
        }
        
        .screenshot-container {
          text-align: center;
          margin-bottom: 1rem;
        }
        
        .screenshot-image {
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .screenshot-overlay {
          margin-top: 1rem;
          background: #f5f5f5;
          padding: 1rem;
          border-radius: 4px;
          text-align: left;
        }
        
        .screenshot-json {
          margin-top: 1rem;
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 4px;
        }
        
        .screenshot-json h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }
        
        .screenshot-json pre {
          margin: 0;
          background: white;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          overflow: auto;
          max-height: 300px;
        }
      `})]}):null,l=i;export{l as default};
